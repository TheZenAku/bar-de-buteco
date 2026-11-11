/**
 * The ambience bus: quiet by design, and the volume slider scales this ceiling, not the recordings. The layers inside are balanced against
 * each other in city-ambience/model.ts; this is only how loud the whole city is next to voices, music and effects.
 * `duck` is the share left while the jukebox or a TV plays; `fadeIn` is the time constant (seconds) of the rise when the sound starts.
 */
export const AMBIENT_MIX={gain:.5,duck:.3,fadeIn:1.8} as const;
