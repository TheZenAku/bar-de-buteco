/**
 * The entry's backdrop: the empty bar seen from fixed three-quarter ("isometric") angles that slide slowly along one
 * axis, cut to the next angle through a fade (BarScene.showcaseCamera drives it while the entry is on screen and no one is
 * in the room). A shot is a straight dolly: both the eye and the target move by `move` during `seconds`, so the angle
 * never changes within a shot; the lens is narrow so the view reads flat like an axonometric drawing.
 */
export interface Shot {
  readonly name: string;
  /** Eye and target at the start of the shot, in map metres. */
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  /** How far both travel along the shot. */
  readonly move: readonly [number, number, number];
  readonly fov: number;
  readonly seconds: number;
}

/** Chosen by looking at the map from above: the roof hides the hall, so the angles circle the building (and its stage and terrace). */
export const SHOTS: readonly Shot[] = [
  { name: 'rua-sudoeste', from: [-24, 26, 14], to: [16, 0, -12], move: [8, 0, -4], fov: 34, seconds: 9 },
  { name: 'palco', from: [44, 14, -8], to: [26, 1, -20], move: [-5, -1, -2], fov: 34, seconds: 9 },
  { name: 'terraco-sudeste', from: [58, 26, 12], to: [16, 0, -12], move: [-4, 0, -9], fov: 34, seconds: 9 },
  { name: 'quintal-nordeste', from: [56, 24, -40], to: [16, 0, -12], move: [-9, 0, 3], fov: 34, seconds: 9 },
];

/** How long the fade takes on each side of a cut. */
export const CUT_SECONDS = .7;

export interface ShowcasePose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
  /** 0 clear, 1 covered: the fade around a cut. */
  readonly cut: number;
}

export class Showcase {
  private time = 0;

  /** Where the camera is after `dt` more seconds. */
  advance(dt: number): ShowcasePose {
    this.time += dt;
    return this.at(this.time);
  }

  /** A pure function of the clock: the shots in a loop, eased in and out of each slide. */
  at(time: number, shots: readonly Shot[] = SHOTS): ShowcasePose {
    const total = shots.reduce((sum, shot) => sum + shot.seconds, 0);
    let t = ((time % total) + total) % total, index = 0;
    while (t >= shots[index]!.seconds) { t -= shots[index]!.seconds; index++; }
    const shot = shots[index]!, u = t / shot.seconds, slide = u * u * (3 - 2 * u) * .4 + u * .6;
    const place = (point: readonly [number, number, number]) => [point[0] + shot.move[0] * slide, point[1] + shot.move[1] * slide, point[2] + shot.move[2] * slide] as const;
    const edge = Math.min(t, shot.seconds - t), cut = Math.max(0, 1 - edge / CUT_SECONDS);
    return { position: place(shot.from), target: place(shot.to), fov: shot.fov, cut: cut * cut * (3 - 2 * cut) };
  }
}
