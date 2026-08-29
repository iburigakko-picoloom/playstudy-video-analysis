(function (root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.PlayStudyGestures = Object.assign({}, root.PlayStudyGestures, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PHASES = Object.freeze({
    IDLE: 'IDLE',
    PENDING_SINGLE: 'PENDING_SINGLE',
    CHAINING: 'CHAINING',
  });

  const DIRECTIONS = new Set(['left', 'right']);

  function createTapSequence({ windowMs = 350 } = {}) {
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new RangeError('windowMs must be a positive finite number');
    }

    const idleState = () => ({
      phase: PHASES.IDLE,
      direction: null,
      lastAt: null,
      deadlineAt: null,
      cumulative: 0,
    });

    const pendingState = (direction, at) => ({
      phase: PHASES.PENDING_SINGLE,
      direction,
      lastAt: at,
      deadlineAt: at + windowMs,
      cumulative: 0,
    });

    const chainingState = (direction, at, cumulative) => ({
      phase: PHASES.CHAINING,
      direction,
      lastAt: at,
      deadlineAt: at + windowMs,
      cumulative,
    });

    function validateState(state) {
      if (!state || !Object.values(PHASES).includes(state.phase)) {
        throw new TypeError('state must be created by this tap sequence');
      }

      if (state.phase === PHASES.IDLE) return;

      if (!DIRECTIONS.has(state.direction)) {
        throw new TypeError('active state direction must be left or right');
      }

      if (!Number.isFinite(state.lastAt)) {
        throw new TypeError('active state lastAt must be finite');
      }
    }

    function validateTime(at) {
      if (!Number.isFinite(at) || at < 0) {
        throw new RangeError('event time must be a non-negative finite number');
      }
    }

    function validateDirection(direction) {
      if (!DIRECTIONS.has(direction)) {
        throw new TypeError('tap direction must be left or right');
      }
    }

    function assertMonotonic(state, at) {
      if (state.lastAt != null && at < state.lastAt) {
        throw new RangeError('event time must not move backwards');
      }
    }

    function chainEndEffect(state) {
      return {
        type: 'chain-end',
        direction: state.direction,
        cumulative: state.cumulative,
      };
    }

    function expiredEffects(state) {
      if (state.phase === PHASES.PENDING_SINGLE) {
        return [{ type: 'single', direction: state.direction }];
      }

      if (state.phase === PHASES.CHAINING) {
        return [chainEndEffect(state)];
      }

      return [];
    }

    function transition(inputState, event) {
      validateState(inputState);

      if (!event || typeof event.type !== 'string') {
        throw new TypeError('event must have a type');
      }

      if (event.type === 'reset') {
        return { state: idleState(), effects: [] };
      }

      if (event.type === 'expire') {
        validateTime(event.at);
        assertMonotonic(inputState, event.at);

        if (
          inputState.phase === PHASES.IDLE ||
          event.at - inputState.lastAt <= windowMs
        ) {
          return { state: { ...inputState }, effects: [] };
        }

        return {
          state: idleState(),
          effects: expiredEffects(inputState),
        };
      }

      if (event.type !== 'tap') {
        throw new TypeError(`unsupported event type: ${event.type}`);
      }

      validateDirection(event.direction);
      validateTime(event.at);
      assertMonotonic(inputState, event.at);

      let state = inputState;
      const effects = [];

      if (
        state.phase !== PHASES.IDLE &&
        event.at - state.lastAt > windowMs
      ) {
        effects.push(...expiredEffects(state));
        state = idleState();
      }

      if (state.phase === PHASES.IDLE) {
        return {
          state: pendingState(event.direction, event.at),
          effects,
        };
      }

      if (state.phase === PHASES.PENDING_SINGLE) {
        if (event.direction === state.direction) {
          const next = chainingState(event.direction, event.at, 1);
          effects.push({
            type: 'skip',
            direction: event.direction,
            delta: 1,
            cumulative: next.cumulative,
          });
          return { state: next, effects };
        }

        return {
          state: pendingState(event.direction, event.at),
          effects,
        };
      }

      if (event.direction === state.direction) {
        const next = chainingState(
          event.direction,
          event.at,
          state.cumulative + 1,
        );
        effects.push({
          type: 'skip',
          direction: event.direction,
          delta: 1,
          cumulative: next.cumulative,
        });
        return { state: next, effects };
      }

      effects.push(chainEndEffect(state));
      return {
        state: pendingState(event.direction, event.at),
        effects,
      };
    }

    return Object.freeze({
      phases: PHASES,
      windowMs,
      initialState: idleState,
      transition,
    });
  }

  function calculateSeekTime({
    mode,
    startTime = 0,
    startX = 0,
    currentX,
    trackLeft = 0,
    trackWidth,
    duration,
  } = {}) {
    if (mode !== 'tap' && mode !== 'drag') {
      throw new TypeError('seek mode must be tap or drag');
    }

    for (const [name, value] of Object.entries({ currentX, trackLeft, trackWidth, duration })) {
      if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
    }

    if (trackWidth <= 0 || duration <= 0) return 0;
    if (mode === 'drag' && (!Number.isFinite(startTime) || !Number.isFinite(startX))) {
      throw new TypeError('drag start values must be finite');
    }

    const time = mode === 'drag'
      ? startTime + ((currentX - startX) / trackWidth) * duration
      : ((currentX - trackLeft) / trackWidth) * duration;

    return Math.min(duration, Math.max(0, time));
  }

  return Object.freeze({ createTapSequence, calculateSeekTime });
});
