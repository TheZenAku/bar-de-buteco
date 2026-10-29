import { Schema, type, view, MapSchema, ArraySchema } from '@colyseus/schema';
import { DEFAULT_SKIN } from '@bar/shared';

export class Player extends Schema {
  @type('string') id = '';
  @type('string') displayName = '';
  @type('string') color = '#e6a23b';
  @type('string') skin: string = DEFAULT_SKIN;
  @type('boolean') oldWalk = false;
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 8;
  @type('float32') rotation = 0;
  @type('string') animationState = 'idle';
  @type('number') animationStartedAt = 0;
  @type('string') interactionState = '';
  @type('string') currentTableId = '';
  @type('int32') lastProcessedInput = -1;
  @type('boolean') connected = true;
  /** Microphone on, so others can show who may speak. */
  @type('boolean') voice = false;
  /** The drink ordered at the counter, shown in hand while drinking ('' otherwise). */
  @type('string') drinkItem = '';
  // Needs, as whole points (precise values live in NeedsDirector). Everyone sees drunkenness and the
  // condition; the HUD shows the rest to the player.
  @type('uint8') hp = 100;
  @type('uint8') hpMax = 100;
  @type('uint8') stamina = 100;
  @type('uint8') hunger = 100;
  @type('uint8') thirst = 100;
  @type('uint8') bladder = 0;
  @type('uint8') drunk = 0;
  @type('boolean') exhausted = false;
  /** normal, stumbling, fainted or recovering. */
  @type('string') condition = 'normal';
  @type('number') conditionUntil = 0;
  @type('string') faintCause = '';
  /** The job being worked ('' when not working), shown to everyone. */
  @type('string') job = '';
  /** Until when the stage pass lasts (server ms); cleared to 0 when it runs out. Client prediction gates the stage on it. */
  @type('number') stageUntil = 0;
  /** A worker's tray: the table order picked up for a customer, comma-separated ('' when empty), and its id. */
  @type('string') carrying = '';
  @type('string') carryingOrder = '';
}
export class Npc extends Schema {
  @type('string') id = '';
  @type('string') displayName = '';
  @type('string') color = '#ddaa66';
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') rotation = 0;
  @type('string') animationState = 'idle';
  @type('number') animationStartedAt = 0;
  @type('string') behavior = 'idle';
  /** Tonico's tray: the items of the order he carries, comma-separated ('' when empty), and its id. */
  @type('string') carrying = '';
  @type('string') carryingOrder = '';
}
/** Something served on a table top (apps/server/src/world/served.ts). */
export class ServedItem extends Schema {
  @type('string') id = '';
  @type('string') item = '';
  @type('uint8') table = 0;
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') rotation = 0;
  /** When it touches the table; until then it travels from the tray, where it was the order's `slot`-th item. */
  @type('number') placedAt = 0;
  @type('string') orderId = '';
  @type('uint8') slot = 0;
  /** The seat it was ordered from: whoever sits there eats it (the bar animations' `comer`). */
  @type('string') seat = '';
  /** When the customer finished it or left it behind (0 while they are on it): from then on it waits to be collected. */
  @type('number') doneAt = 0;
}
export class CardState extends Schema {
  @type('string') rank = '?';
  @type('string') suit = '';
}
export class SeatState extends Schema {
  @type('string') playerId = '';
  @type('string') displayName = '';
  @type([CardState]) cards = new ArraySchema<CardState>();
  @type('uint8') total = 0;
  @type('string') status = 'waiting';
  @type('string') result = '';
}
export class TableState extends Schema {
  @type('string') id = 'blackjack-1';
  @type('string') phase = 'waiting';
  @type([SeatState]) seats = new ArraySchema<SeatState>();
  @type([CardState]) dealerCards = new ArraySchema<CardState>();
  @type('uint8') dealerTotal = 0;
  @type('string') turnPlayerId = '';
  @type('number') deadline = 0;
  @type('string') roundId = '';
}
export class EventState extends Schema {
  @type('string') id = '';
  @type('string') type = '';
  @type('number') startedAt = 0;
  @type('number') durationMs = 0;
}
/** Playback of one YouTube source: the jukebox, or one TV group (separate maps in BarState). */
export class Jukebox extends Schema {
  @type('string') id='';
  @type('string') videoId='';
  @type('string') status='off';
  @type('number') position=0;
  @type('number') updatedAt=0;
  @type('string') updatedBy='';
  @type('number') revision=0;
}
/** A hinged door (one or two leaves), open or closed; clients animate the swing from changedAt. */
export class DoorState extends Schema {
  @type('string') id = '';
  @type('boolean') open = true;
  @type('number') changedAt = 0;
}
/** One of the stage's musicians' spots (apps/server/src/world/musicians.ts): who plays there and since when. */
export class MusicianSpot extends Schema {
  @type('string') id = '';
  /** '' while the spot is free. */
  @type('string') playerId = '';
  /** entrando, comecando, loop or saindo ('' while free); see packages/shared/src/musicians.ts. */
  @type('string') phase = '';
  /** When the phase began (server ms). */
  @type('number') startedAt = 0;
  @type('boolean') stopping = false;
}
/** Public occupancy of a job's slots (apps/server/src/world/jobs.ts). */
export class JobSlotState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('uint8') slots = 0;
  @type('uint8') workers = 0;
  @type('uint16') pay = 0;
  @type('boolean') enabled = true;
}
export class BarState extends Schema {
  @view() @type({ map: Player }) players = new MapSchema<Player>();
  @view() @type({ map: Npc }) npcs = new MapSchema<Npc>();
  @type({ map: TableState }) tables = new MapSchema<TableState>();
  @type({ map: Jukebox }) jukeboxes = new MapSchema<Jukebox>();
  @type({ map: Jukebox }) televisions = new MapSchema<Jukebox>();
  @type({ map: DoorState }) doors = new MapSchema<DoorState>();
  @type({ map: JobSlotState }) jobs = new MapSchema<JobSlotState>();
  @type({ map: ServedItem }) served = new MapSchema<ServedItem>();
  @type({ map: MusicianSpot }) musicians = new MapSchema<MusicianSpot>();
  @type(EventState) event = new EventState();
  @type('uint16') occupancy = 0;
  @type('uint16') capacity = 32;
  @type('number') serverTime = 0;
}
