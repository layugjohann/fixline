import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LanguageModel } from "ai";
import { FakeBoard } from "@/board";
import type { Trace } from "@/domain";
import { NoProposalError, runIntake } from "@/intake";
import { ModelRateLimitError } from "@/models";
import { failAll, gradeProposal, type Grade } from "./graders";
import type { GoldenScenario } from "./scenario";
import { buildScorecard, type Scorecard, type ScenarioResult } from "./scorecard";

export interface EvalOptions {
  model: LanguageModel;
  /** The name the model is recorded under on the scorecard, such as `groq:openai/gpt-oss-120b`. */
  modelName?: string;
  /** Where the run's traces and scorecard are written. Nothing is written when omitted. */
  outputDir?: string;
  /** Called after each scenario, for progress output. */
  onScenario?: (result: ScenarioResult) => void;
}

export interface EvalRun {
  scorecard: Scorecard;
  traces: Record<string, Trace>;
}

/** Run every scenario through Intake against its own fresh fake Board, then grade it. */
export async function runEvals(scenarios: readonly GoldenScenario[], options: EvalOptions): Promise<EvalRun> {
  const startedAt = new Date().toISOString();
  const results: ScenarioResult[] = [];
  const traces: Record<string, Trace> = {};

  let quotaExhausted: ModelRateLimitError | undefined;
  for (const scenario of scenarios) {
    // Once the provider says its quota is used up, the rest can't run either: don't spend more calls.
    const { result, trace, rateLimit } = quotaExhausted
      ? notRun(scenario, quotaExhausted)
      : await runScenario(scenario, options.model);
    if (rateLimit?.kind === "quota") quotaExhausted = rateLimit;
    results.push(result);
    traces[scenario.id] = trace;
    options.onScenario?.(result);
  }

  const scorecard = buildScorecard({ model: options.modelName ?? describeModel(options.model), startedAt, results });

  if (options.outputDir) {
    const traceDir = path.join(options.outputDir, "traces");
    await mkdir(traceDir, { recursive: true });
    for (const [scenarioId, trace] of Object.entries(traces)) {
      await writeFile(path.join(traceDir, `${scenarioId}.json`), `${JSON.stringify(trace, null, 2)}\n`);
    }
    await writeFile(path.join(options.outputDir, "scorecard.json"), `${JSON.stringify(scorecard, null, 2)}\n`);
  }

  return { scorecard, traces };
}

async function runScenario(
  scenario: GoldenScenario,
  model: LanguageModel,
): Promise<ScenarioRun> {
  const base = { scenarioId: scenario.id, description: scenario.description, tags: scenario.tags };
  try {
    const intake = await runIntake(scenario.message, {
      model,
      board: new FakeBoard(scenario.board),
      propertyRoster: scenario.propertyRoster,
    });
    const grades = gradeProposal(intake.proposal, scenario.expected);
    return { result: { ...base, ...outcome(grades), proposal: intake.proposal }, trace: intake.trace };
  } catch (error) {
    if (error instanceof NoProposalError) {
      // The agent failed: that is a graded failure, with the steps it took kept for diagnosis.
      const grades = failAll(`no Proposal: ${error.message}`);
      return {
        result: { ...base, ...outcome(grades) },
        trace: { messageId: scenario.message.id, steps: error.steps },
      };
    }
    // A rate limit or used-up quota means the scenario never ran: it is neither passed nor failed.
    if (error instanceof ModelRateLimitError) return notRun(scenario, error);
    // Other infrastructure errors are not agent failures either, so they aren't graded.
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return {
      result: { ...base, status: "error", error: reason, grades: [] },
      trace: { messageId: scenario.message.id, steps: [] },
    };
  }
}

interface ScenarioRun {
  result: ScenarioResult;
  trace: Trace;
  /** Set when the model provider's rate limit or quota stopped the scenario. */
  rateLimit?: ModelRateLimitError;
}

function notRun(scenario: GoldenScenario, error: ModelRateLimitError): ScenarioRun {
  return {
    rateLimit: error,
    result: {
      scenarioId: scenario.id,
      description: scenario.description,
      tags: scenario.tags,
      status: "not-run",
      rateLimit: error.kind,
      error: `${error.name}: ${error.message}`,
      grades: [],
    },
    trace: { messageId: scenario.message.id, steps: [] },
  };
}

function outcome(grades: Grade[]): { status: "pass" | "fail"; grades: Grade[] } {
  return { status: grades.some((grade) => grade.status === "fail") ? "fail" : "pass", grades };
}

function describeModel(model: LanguageModel): string {
  return typeof model === "string" ? model : `${model.provider}:${model.modelId}`;
}
