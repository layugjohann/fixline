# Maintenance Intake

Harbor Lane Property Management (a fictional company) receives messy, unstructured messages from tenants about things that are broken. This context covers turning those messages into structured Work Orders on the company's existing Board, with a human approving anything uncertain.

## Language

### People and places

**Tenant**:
A person renting a Unit, as listed in the Property Roster.
_Avoid_: Customer, resident, user

**Property**:
A building managed by the company, containing one or more Units.
_Avoid_: Building, site, address

**Unit**:
A single rentable space within a Property, occupied by one or more Tenants.
_Avoid_: Apartment, flat, room

**Common Area**:
A shared space in a Property that belongs to no single Unit, such as a lobby, stairwell, or laundry room.
_Avoid_: Shared space, communal area

**Property Roster**:
The company's reference list of Properties, Units, and Tenants with their contact details.
_Avoid_: Directory, CRM, tenant list

### Intake

**Sender**:
Whoever sent a Message. A Sender resolves to a Tenant only if the Property Roster lists them; an unknown Sender is a normal case, not an error.
_Avoid_: Author, contact, requester

**Message**:
One raw inbound communication from a Sender, exactly as received and never edited. A Message may relate to zero, one, or many Work Orders.
_Avoid_: Request, email, complaint, ticket

**Draft Reply**:
A response to a Tenant composed on the company's behalf, which is never sent without human approval.
_Avoid_: Response, auto-reply

**Proposal**:
The complete set of changes the agent wants to make in response to one Message: Work Orders to create or update, and any Draft Replies. A Proposal changes nothing until it is applied.
_Avoid_: Plan, action, suggestion, result

**Review Queue**:
Where Proposals wait for a human to approve, edit, or reject them before they are applied.
_Avoid_: Inbox, approval list, moderation queue

### Work

**Work Order**:
The structured record of one maintenance problem in one Unit or Common Area that needs fixing. It is the unit of work on the Board.
_Avoid_: Ticket, task, issue, card, job

**Urgency**:
How quickly a Work Order must be addressed: **emergency** (risk to safety or property, same day), **urgent** (within days), or **routine** (scheduled at convenience).
_Avoid_: Priority, severity

**Trade**:
The kind of skill needed to fix a Work Order, such as plumbing, electrical, or HVAC.
_Avoid_: Category, type, department

**Board**:
The company's existing system of record where Work Orders live and are tracked through to completion.
_Avoid_: Database, backlog, Trello (Trello is one implementation of a Board, not the concept)
