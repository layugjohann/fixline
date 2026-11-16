import { FakeBoard } from "./index";
import { describeBoardContract } from "./contract";

describeBoardContract("fake Board", async () => {
  const board = new FakeBoard();
  return {
    board,
    closeWorkOrder: (id) => board.closeWorkOrder(id),
    missingId: "WO-999",
  };
});
