import { Schema, type, view, MapSchema, ArraySchema } from '@colyseus/schema';
import { DEFAULT_SKIN } from '@bar/shared';

export class Player extends Schema {
  @type('string') id = '';
  @type('string') displayName = '';
  @type('string') color = '#e6a23b';
  @type('string') skin: string = DEFAULT_SKIN;
  @type('float32') x = 0;
  @type('float32') z = 8;
  @type('float32') rotation = 0;
  @type('string') animationState = 'idle';
  @type('string') interactionState = '';
  @type('string') currentTableId = '';
  @type('int32') lastProcessedInput = -1;
  @type('boolean') connected = true;
}
export class Npc extends Schema {
  @type('string') id = '';
  @type('string') displayName = '';
  @type('string') color = '#ddaa66';
  @type('float32') x = 0;
  @type('float32') z = 0;
  @type('float32') rotation = 0;
  @type('string') animationState = 'idle';
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
export class BarState extends Schema {
  @view() @type({ map: Player }) players = new MapSchema<Player>();
  @view() @type({ map: Npc }) npcs = new MapSchema<Npc>();
  @type({ map: TableState }) tables = new MapSchema<TableState>();
  @type(EventState) event = new EventState();
  @type('uint16') occupancy = 0;
  @type('uint16') capacity = 32;
  @type('number') serverTime = 0;
}
