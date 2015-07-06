var dot = require('graphlib-dot');
var types = require('./types');
var graph = require('./graph');
var linearize = require('./linearize');
var stream = require('./stream');
var stageLoader = require('./stage-loader');
var assert = require('chai').assert;

function mkPipe(nodeName, inGraph) {
  var options = inGraph.node(nodeName);
  var phaseName = nodeName;
  if (options !== undefined) {
    if (options.stage) {
      phaseName = options.stage;
    } else if (options.label) {
      phaseName = options.label;
    }
  }
  var result = new graph.Pipe(phaseName, options);
  result.nodeName = nodeName;
  return result;
}

function doExperiment() {
  return {
    impl: function(data, cb) {
      var inGraph = dot.read(data);
      // TODO: Perhaps create instance of stage-loader and ask it to load these
      //       to avoid polluting other experiments.
      if (inGraph.graph().imports) {
        var imports = eval(inGraph._label.imports);
        imports.forEach(function(lib) {
          // TODO: figure out the right way to specify this path
          require('../' + lib);
        });
      }
      var edges = inGraph.edges();
      var pipes = {};
      for (var i = 0; i < edges.length; i++) {
        var edge = edges[i];
        if (!pipes[edge.v])
          pipes[edge.v] = mkPipe(edge.v, inGraph);
        if (!pipes[edge.w])
          pipes[edge.w] = mkPipe(edge.w, inGraph);
        graph.connect(pipes[edge.v], pipes[edge.w]);
      }
      var linear = linearize(pipes[edges[0].v].graph);
      var linearNames = linear.map(function(x) { return x.map(function(a) { return a.nodeName; })});

      var linearGroups = linearNames.map(function(a) { return a.map(function(x) {
        var result = [];
        var parent = inGraph.parent(x);
        while (parent !== undefined) {
          if (inGraph.node(parent).strategy == 'pipeline')
            result.push(parent);
          parent = inGraph.parent(parent);
        }
        return result;
      }); });

      linearGroups = linearGroups.map(function(x) {
        var result = [];
        for (var i = 0; i < x[0].length; i++) {
          for (var j = 1; j < x.length; j++) {
            if (x[j].indexOf(x[0][i]) == -1)
              break;
          }
          if (j == x.length)
            result.push(x[0][i]);
        }
        return result;
      });

      var phaseStack = [[]];
      var groupStack = [];

      for (var i = 0; i < linear.length; i++) {
         for (var j = 0; j < linearGroups[i].length; j++) {
          if (groupStack.indexOf(linearGroups[i][j]) == -1) {
            groupStack.push(linearGroups[i][j]);
            phaseStack.push([]);
          }
        }

        var streams = linear[i].map(function(pipe, idx) {
          var thisStream = stageLoader.stageSpecificationToStage(pipe.stageName, pipe.options);
          thisStream.setInput('efrom', idx + '');
          thisStream.setOutput('eto', idx + '');
          return thisStream;
        });
        phaseStack[phaseStack.length - 1] = phaseStack[phaseStack.length - 1].concat(streams);

        if (i == linear.length - 1)
          break;

        while (groupStack.length > 0 && (linearGroups[i + 1].indexOf(groupStack[groupStack.length - 1]) == -1)) {
          // we've reached the end of this group stack
          groupStack.pop();
          var phases = phaseStack.pop(); // do wrapping here
          var consolidated = stream.stageWrapper(phases);
          phaseStack[phaseStack.length - 1].push(consolidated);
        }

        var outgoing = linear[i].map(function(pipe) { return pipe.out; }).filter(function(v, i, s) { return s.indexOf(v) == i; });
        var ins = outgoing.map(function(con) { return con.fromPipes; });
        ins = ins.map(function(a) { return a.map(function(b) { return linearNames[i].indexOf(b.nodeName); })});
        var outs = outgoing.map(function(con) { return con.toPipes; });
        outs = outs.map(function(a) { return a.map(function(b) { return linearNames[i + 1].indexOf(b.nodeName); })});
        var routingStage = new stream.RoutingStage(ins, outs);
        phaseStack[phaseStack.length - 1].push(routingStage);

      }

      assert(phaseStack.length == 1);
      stageLoader.processStages(phaseStack[0], cb, function(e) { throw e; });
    },
    name: 'doExperiment',
    input: types.string,
    output: types.unit
  };
}

module.exports.doExperiment = doExperiment;
