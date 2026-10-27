import { Schema, type, view, MapSchema, ArraySchema } from '@colyseus/schema';
import { DEFAULT_SKIN } from '@bar/shared';

export class Player extends Schema {
  @type('string') id = '';
  @type('string') displayName = '';
  @type('string') color = '#e6a23b';
  @type('string') skin: string = DEFAULT_SKIN;
  @type('string') character = '';
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
  @type(EventState) event = new EventState();
  @type('uint16') occupancy = 0;
  @type('uint16') capacity = 32;
  @type('number') serverTime = 0;
}
