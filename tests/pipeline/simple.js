var assert = require('chai').assert;
var stageLoader = require('../../core/stage-loader');
var stages = require('../../core/stages');
var fancyStages = require('../../core/fancy-stages');
var types = require('../../core/types');
var experiment = require('../../core/experiment');
var stream = require('../../core/stream');

function testPipeline(stageList, incb) {
  var cb = function(data) { incb(); };
  stageLoader.processStages(stageList, cb, function(e) { throw e; });
};

function testOutput(expectedResult) {
  return {
    impl: function(data, cb) {
      assert.deepEqual(expectedResult, data.data[0].data);
      cb();
    },
    name: 'testOutput',
    input: types.newTypeVar(),
    output: types.unit
  }
}

function testMatch() {
  var typeVar = types.newTypeVar();
  return {
    impl: function(data, cb) {
      assert.deepEqual(data.right.data[0].data, data.left.data[0].data);
      cb();
    },
    name: 'testMatch',
    input: types.Tuple(typeVar, typeVar),
    output: types.unit
  }
}

// FIXME: Make this much nicer
function fileComparisonPipeline(jsonFile, htmlFile) {
  return [
    fancyStages.immediate({left: new stream.Stream(), right: new stream.Stream()},
          types.Tuple(types.Stream({key: 'from', type: types.unit}), types.Stream({key: 'from', type: types.unit}))),
    fancyStages.left(stageLoader.stageSpecificationToStage("JSON:" + jsonFile)),
    fancyStages.right(stageLoader.stageSpecificationToStage("file:" + htmlFile)),
    fancyStages.left(stageLoader.stageSpecificationToStage("HTMLWriter")),
    testMatch(),
  ];
}

function tokenizeDetokenizePipeline(jsonFile) {
  return [
    stageLoader.stageSpecificationToStage("JSON:" + jsonFile),
    fancyStages.tee(),
    fancyStages.left(stageLoader.stageSpecificationToStage("StyleTokenizerFilter")),
    fancyStages.left(stageLoader.stageSpecificationToStage("StyleDetokenizerFilter")),
    testMatch()
  ]
}

// TODO: glob these so we can automatically test lots of inputs/outputs.

describe('Simple Pipeline', function() {
  it('should generate valid html', function(done) {
    var output = testOutput('<!DOCTYPE html><base href="http://localhost:8000/simple.html"><html><head>\n<style>\n.a {\n  background: red;\n  width: 100px;\n  height: 100px;\n}\n</style>\n</head><body><div class="a">This is some text in a div</div>\n</body></html>');
    var pipeline = ["JSON:tests/pipeline/simple.json", "HTMLWriter"];
    pipeline = pipeline.map(stageLoader.stageSpecificationToStage);
    pipeline.push(output);
    testPipeline(pipeline, done);
  });

  it('simple json dumps should match prerendered html', function(done) {
    testPipeline(fileComparisonPipeline("tests/pipeline/simple.json", "tests/pipeline/simple.html"), done);
  });

  it('slightly more complicated json dumps should match prerendered html', function(done) {
    testPipeline(fileComparisonPipeline("tests/pipeline/inline-style.json", "tests/pipeline/inline-style.html"), done);
  });
});

describe('Style Tokenizer / Detokenizer', function() {
  it('should be idempotent in the absence of inline style', function(done) {
    testPipeline(tokenizeDetokenizePipeline("tests/pipeline/simple.json"), done);
  });

  it('should be idempotent in the presence of inline style', function(done) {
    testPipeline(tokenizeDetokenizePipeline("tests/pipeline/inline-style.json"), done);
  });
});

function compare(name) {
  return {
    impl: function(input, cb) {
      stages.fileToString().impl(name, function(data) {
        assert.equal(data, input, "for file " + name);
        cb(input);
      });
    },
    name: 'compare',
    input: types.string,
    output: types.string
  };
}
 

describe('experiment', function() {
  it('should be able to run', function(done) {
    experiment.outputFor = function(unused, name) {
      return [fancyStages.valueMap(compare(name))];
    }

    testPipeline(['file:tests/pipeline/simple.exp', 'parseExperiment', 'experimentPhase'].map(stageLoader.stageSpecificationToStage), done);
  });
});
    
