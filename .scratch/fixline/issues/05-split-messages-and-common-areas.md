# 05: Split multi-problem Messages + Common Areas

**What to build:** A single Message describing several problems yields one Proposal with several operations. For example, "the heater is dead again, also the kitchen tap drips" attaches to the existing heater Work Order and creates a new one for the tap. Problems in a Common Area (lobby, laundry room) are recorded against that Common Area, not the Sender's Unit, so reports from different Units can merge.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The Property Roster fixture includes Common Areas per Property
- [ ] Work Orders can belong to a Unit or a Common Area
- [ ] There are graders for the number of Work Orders and for location (Unit or Common Area)
- [ ] Scenarios cover a two-problem Message (attach + create), a three-problem Message, and Common Area reports from two different Units merging into one Work Order
- [ ] A deterministic test covers a multi-operation Proposal being applied completely
