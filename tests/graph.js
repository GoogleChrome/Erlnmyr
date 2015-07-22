/*
  Copyright 2015 Google Inc. All Rights Reserved.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at
      http://www.apache.org/licenses/LICENSE-2.0
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

var assert = require('chai').assert;

var graph = require('../core/graph.js');
var linearize = require('../core/linearize.js');

function reachable(a, b) {
  var reachableSet = {};
  if (a.isPipe())
    var delta = [a];
  else
    var delta = a.toPipes;

  while (delta.length > 0) {
    var newDelta = [];
    for (var i = 0; i < delta.length; i++) {
      if (b.isPipe() && delta[i] == b)
        return true;
      if (b.isConnection() && delta[i].out == b)
        return true;
      reachableSet[delta[i].id] = delta[i];
    }
    for (var i = 0; i < delta.length; i++) {
      var pipe = delta[i];
      if (pipe.out == undefined)
        continue;
      for (var i = 0; i < pipe.out.toPipes.length; i++) {
        var outPipe = pipe.out.toPipes[i];
        if (outPipe.id in reachableSet)
          continue;
        newDelta.push(outPipe);
      }
    }
    delta = newDelta;
  }
  return false;
}

function assertConnected(a, b) {
  assert.equal(a.graph, b.graph);
  assert(a.graph.contains(a), "left argument is not in graph");
  assert(a.graph.contains(b), "right argument is not in graph");
  assert(reachable(a, b), "pipes are not connected");
}
  
describe('graph.connect', function() {
  it('should allow two pipes to connect', function() {
    var a = new graph.Pipe('a');
    var b = new graph.Pipe('b');
    graph.connect(a, b);
    assertConnected(a, b);
    assert.deepEqual(a.graph.inputs(), [a]);
    assert.deepEqual(a.graph.outputs(), [b]);
    assert.deepEqual(linearize(a.graph), [[a], [b]]);
  });
  it('should allow a connection to connect to a pipe', function() {
    var a = new graph.Connection();
    var b = new graph.Pipe('b');
    graph.connect(a, b);
    assertConnected(a, b);
    assert.deepEqual(a.graph.inputs(), [a]);
    assert.deepEqual(a.graph.outputs(), [b]);
    assert.deepEqual(linearize(a.graph), [[b]]);
  });
  it('should allow a pipe to connect to a connection', function() {
    var a = new graph.Pipe('a');
    var b = new graph.Connection();
    graph.connect(a, b);
    assertConnected(a, b);
    assert.deepEqual(a.graph.inputs(), [a]);
    assert.deepEqual(a.graph.outputs(), [b]);
    assert.deepEqual(linearize(a.graph), [[a]]);
  });

  /*
   * -a-> . -b->
   *      |
   *      v
   * -c-> . -d->
   */
  it('should connect to already connected pipes', function() {
    var a = new graph.Pipe('a');
    var b = new graph.Pipe('b');
    graph.connect(a, b);
    var c = new graph.Pipe('c');
    var d = new graph.Pipe('d');
    graph.connect(c, d);
    graph.connect(a, d);
    assertConnected(a, b);
    assertConnected(c, d);
    assertConnected(a, d);
    assert(!reachable(a, c), "c should not be reachable from a");
    assert(!reachable(c, b), "b should not be reachable from c");
    assert.deepEqual(a.graph.inputs(), [a, c]);
    assert.deepEqual(a.graph.outputs(), [b, d]);
    var x = a.out.toPipes[1];
    assert.deepEqual(linearize(a.graph), [[a, c], [b, x], [d]]);
  });
  it('should allow extra paths to be installed when a direct path exists', function() {
    var a = new graph.Pipe('a');
    var b = new graph.Pipe('b');
    graph.connect(a, b);
    a.graph.dump();
    console.log('---');
    var c = new graph.Pipe('c');
    graph.connect(a, c);
    a.graph.dump();
    console.log('---');
    graph.connect(c, b);
    a.graph.dump();
    assert.deepEqual(linearize(a.graph), [[a], [c], [b]]);
  });
});

describe('Pipe.from', function() {
  it('should handle a moderately complicated example', function() {
    var a = new graph.Pipe('a');
    var b = new graph.Pipe('b');
    var c = new graph.Pipe('c');
    var d = new graph.Pipe('d');
    var e = new graph.Pipe('e');

    function makeExample(input) {
      var aout = a.from(input);
      assertConnected(a, aout);
      var bout = b.from(aout);
      var cout = c.from(bout);
      var dout = d.from(cout);
      assertConnected(a, dout);
      var result = e.from([aout, bout, cout, dout]);
      assert(aout.toPipes.length == 2);
      assert(bout.toPipes.length == 2);
      assert(cout.toPipes.length == 2);
      assert(dout.toPipes.length == 1);
      assert(e.in.fromPipes.length == 4);
      return result;
    }

    var con = new graph.Connection();
    var out = makeExample(con);

    assertConnected(con, out);

    assert.deepEqual(a.graph.inputs(), [con]);
    assert.deepEqual(a.graph.outputs(), [out]);

    var aa = a.out.toPipes[1];
    var bb = b.out.toPipes[1];
    var cc = c.out.toPipes[1];
    assert.deepEqual(linearize(a.graph), [[a], [b, aa], [c, bb], [d, cc], [e]]);
  });
});
