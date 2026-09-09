import assert from 'node:assert/strict';
import test from 'node:test';

await import('../public/playstudy/player-gestures.js');

const { createTapSequence, calculateSeekTime } = globalThis.PlayStudyGestures;

function boostFixture(initial=1){
 let rate=initial;const timers=[];
 const boost=globalThis.PlayStudyGestures.createHoldBoost({getRate:()=>rate,setRate:value=>rate=value,schedule:fn=>{timers.push(fn);return timers.length},cancel:()=>{}});
 return {boost,timers,get rate(){return rate},set rate(value){rate=value},down:(id=1)=>boost.start({pointerId:id,clientX:10,clientY:10,isPrimary:true,button:0})};
}
test('temporary boost restores the selected rate and never exposes 2x as saved speed',()=>{
 const f=boostFixture(.5);f.down();f.timers[0]();assert.equal(f.rate,2);assert.equal(f.boost.savedRate,.5);f.boost.end({pointerId:1});assert.equal(f.rate,.5);f.boost.stop();assert.equal(f.rate,.5);
});
test('repeated pointer downs cannot leave an old hold timer running',()=>{
 const f=boostFixture();f.down();f.down();f.timers[0]();assert.equal(f.rate,1);f.boost.end({pointerId:1});f.timers[1]();assert.equal(f.rate,1);
});
test('a new gesture restores the base rate before another hold starts',()=>{
 const f=boostFixture();f.down();f.timers[0]();f.down(2);assert.equal(f.rate,1);f.timers[1]();f.boost.stop();assert.equal(f.rate,1);
});
test('movement, lost mouse buttons and lifecycle cancellation stop the boost',()=>{
 for(const event of [{pointerId:1,clientX:30,clientY:10,buttons:1},{pointerId:1,clientX:10,clientY:10,buttons:0}]){const f=boostFixture();f.down();f.timers[0]();f.boost.move(event);assert.equal(f.rate,1)}
 const f=boostFixture();f.down();f.timers[0]();f.boost.stop();f.rate=.75;f.boost.end({pointerId:1});assert.equal(f.rate,.75);
});
test('a secondary touch cancels boost without starting another timer',()=>{
 const f=boostFixture();f.down();f.timers[0]();f.boost.start({pointerId:2,isPrimary:false});assert.equal(f.rate,1);assert.equal(f.timers.length,1);
});

function tap(machine, state, direction, at) {
  return machine.transition(state, { type: 'tap', direction, at });
}

function expire(machine, state, at) {
  return machine.transition(state, { type: 'expire', at });
}

test('exposes the UMD global and starts in IDLE', () => {
  assert.equal(typeof createTapSequence, 'function');
  const machine = createTapSequence({ windowMs: 350 });

  assert.deepEqual(machine.initialState(), {
    phase: 'IDLE',
    direction: null,
    lastAt: null,
    deadlineAt: null,
    cumulative: 0,
  });
});

test('same-direction second tap starts one skip and later taps add one each', () => {
  const machine = createTapSequence({ windowMs: 350 });
  let state = machine.initialState();

  let result = tap(machine, state, 'right', 1000);
  state = result.state;
  assert.equal(state.phase, 'PENDING_SINGLE');
  assert.equal(state.cumulative, 0);
  assert.deepEqual(result.effects, []);

  result = tap(machine, state, 'right', 1200);
  state = result.state;
  assert.equal(state.phase, 'CHAINING');
  assert.equal(state.cumulative, 1);
  assert.deepEqual(result.effects, [
    { type: 'skip', direction: 'right', delta: 1, cumulative: 1 },
  ]);

  result = tap(machine, state, 'right', 1400);
  state = result.state;
  assert.equal(state.cumulative, 2);
  assert.deepEqual(result.effects, [
    { type: 'skip', direction: 'right', delta: 1, cumulative: 2 },
  ]);

  result = tap(machine, state, 'right', 1600);
  assert.equal(result.state.cumulative, 3);
  assert.deepEqual(result.effects, [
    { type: 'skip', direction: 'right', delta: 1, cumulative: 3 },
  ]);
});

test('the exact window boundary remains part of the active sequence', () => {
  const machine = createTapSequence({ windowMs: 350 });
  let state = tap(machine, machine.initialState(), 'left', 100).state;

  let result = tap(machine, state, 'left', 450);
  state = result.state;
  assert.equal(state.phase, 'CHAINING');
  assert.equal(state.cumulative, 1);
  assert.equal(result.effects[0].type, 'skip');

  result = tap(machine, state, 'left', 800);
  assert.equal(result.state.phase, 'CHAINING');
  assert.equal(result.state.cumulative, 2);
  assert.equal(result.effects[0].cumulative, 2);
});

test('a tap beyond the deadline closes the old sequence and arms a new one', () => {
  const machine = createTapSequence({ windowMs: 350 });
  let state = tap(machine, machine.initialState(), 'right', 0).state;

  let result = tap(machine, state, 'right', 351);
  state = result.state;
  assert.equal(state.phase, 'PENDING_SINGLE');
  assert.equal(state.direction, 'right');
  assert.equal(state.cumulative, 0);
  assert.deepEqual(result.effects, [{ type: 'single', direction: 'right' }]);

  state = tap(machine, state, 'right', 500).state;
  assert.equal(state.phase, 'CHAINING');
  assert.equal(state.cumulative, 1);

  result = tap(machine, state, 'right', 851);
  assert.equal(result.state.phase, 'PENDING_SINGLE');
  assert.equal(result.state.cumulative, 0);
  assert.deepEqual(result.effects, [
    { type: 'chain-end', direction: 'right', cumulative: 1 },
  ]);
});

test('opposite direction ends a chain and requires a new pair', () => {
  const machine = createTapSequence({ windowMs: 350 });
  let state = machine.initialState();
  state = tap(machine, state, 'right', 0).state;
  state = tap(machine, state, 'right', 100).state;

  let result = tap(machine, state, 'left', 200);
  state = result.state;
  assert.equal(state.phase, 'PENDING_SINGLE');
  assert.equal(state.direction, 'left');
  assert.equal(state.cumulative, 0);
  assert.deepEqual(result.effects, [
    { type: 'chain-end', direction: 'right', cumulative: 1 },
  ]);

  result = tap(machine, state, 'left', 300);
  assert.equal(result.state.phase, 'CHAINING');
  assert.equal(result.state.direction, 'left');
  assert.equal(result.state.cumulative, 1);
  assert.deepEqual(result.effects, [
    { type: 'skip', direction: 'left', delta: 1, cumulative: 1 },
  ]);
});

test('opposite direction while pending rearms without skipping', () => {
  const machine = createTapSequence({ windowMs: 350 });
  let state = tap(machine, machine.initialState(), 'left', 10).state;

  let result = tap(machine, state, 'right', 100);
  state = result.state;
  assert.equal(state.phase, 'PENDING_SINGLE');
  assert.equal(state.direction, 'right');
  assert.equal(state.cumulative, 0);
  assert.deepEqual(result.effects, []);

  result = tap(machine, state, 'right', 200);
  assert.equal(result.state.phase, 'CHAINING');
  assert.equal(result.state.cumulative, 1);
  assert.equal(result.effects[0].type, 'skip');
});

test('expire is inclusive at the boundary and resolves after it', () => {
  const machine = createTapSequence({ windowMs: 350 });
  let state = tap(machine, machine.initialState(), 'left', 1000).state;

  let result = expire(machine, state, 1350);
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.effects, []);

  result = expire(machine, state, 1350.001);
  assert.equal(result.state.phase, 'IDLE');
  assert.deepEqual(result.effects, [{ type: 'single', direction: 'left' }]);

  state = tap(machine, machine.initialState(), 'right', 2000).state;
  state = tap(machine, state, 'right', 2100).state;
  result = expire(machine, state, 2450.001);
  assert.equal(result.state.phase, 'IDLE');
  assert.deepEqual(result.effects, [
    { type: 'chain-end', direction: 'right', cumulative: 1 },
  ]);
});

test('reset clears pending and chaining state without side effects', () => {
  const machine = createTapSequence({ windowMs: 350 });
  let state = tap(machine, machine.initialState(), 'right', 0).state;
  let result = machine.transition(state, { type: 'reset' });
  assert.deepEqual(result, { state: machine.initialState(), effects: [] });

  state = tap(machine, machine.initialState(), 'left', 0).state;
  state = tap(machine, state, 'left', 100).state;
  const before = structuredClone(state);
  result = machine.transition(state, { type: 'reset' });

  assert.deepEqual(state, before, 'transition must not mutate its input state');
  assert.deepEqual(result, { state: machine.initialState(), effects: [] });
});

test('rejects invalid configuration and non-monotonic events', () => {
  assert.throws(() => createTapSequence({ windowMs: 0 }), RangeError);
  const machine = createTapSequence({ windowMs: 350 });
  const state = tap(machine, machine.initialState(), 'right', 100).state;

  assert.throws(
    () => tap(machine, state, 'right', 99),
    /must not move backwards/,
  );
  assert.throws(
    () => tap(machine, state, 'center', 120),
    /left or right/,
  );
});

test('seek tap goes to the touched position without marker snapping', () => {
  assert.equal(calculateSeekTime({
    mode: 'tap',
    currentX: 375,
    trackLeft: 75,
    trackWidth: 400,
    duration: 200,
  }), 150);
});

test('seek drag moves relative to the time at pointer down', () => {
  assert.equal(calculateSeekTime({
    mode: 'drag',
    startTime: 80,
    startX: 300,
    currentX: 350,
    trackWidth: 500,
    duration: 200,
  }), 100);

  assert.equal(calculateSeekTime({
    mode: 'drag',
    startTime: 5,
    startX: 300,
    currentX: 0,
    trackWidth: 500,
    duration: 200,
  }), 0);
});
test('precision drag uses thirty seconds across the track without changing taps',()=>{
 assert.equal(calculateSeekTime({mode:'drag',startTime:1800,startX:100,currentX:150,trackWidth:300,duration:7200,dragSpan:30}),1805);
 assert.equal(calculateSeekTime({mode:'tap',currentX:150,trackLeft:0,trackWidth:300,duration:7200,dragSpan:30}),3600);
 assert.equal(calculateSeekTime({mode:'drag',startTime:5,startX:100,currentX:400,trackWidth:300,duration:10,dragSpan:30}),10);
});
