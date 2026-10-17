// Rules for the table's heavier effects (WebGL background, particles).
export const SLOW_FPS = 40;
export const SLOW_SECONDS = 3;
export const PARTICLE_AMBIENTS = new Set(['embers', 'fireflies', 'snow', 'dust']);

// Seconds in a row the screen ran slow; at SLOW_SECONDS the table switches to the light CSS effects.
export const slowStreak = (streak: number, fps: number) => (fps < SLOW_FPS ? streak + 1 : 0);
