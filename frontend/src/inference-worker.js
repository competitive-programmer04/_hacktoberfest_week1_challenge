importScripts("/onnx/ort.min.js");

let inferenceSession = null;
let labels = [];

self.onmessage = async function(e){
    const {type, payload} = e.data;
    if(type === "LOAD_MODEL"){
        try{
            ort.env.wasm.wasmPaths = "/onnx/";
            ort.env.wasm.numThreads = 1;
            inferenceSession = await ort.InferenceSession.create(payload.modelBuffer,{
                executionProviders: ["wasm"],
                graphOptimizationLevel: "all"
            });
            labels = payload.labels;
            self.postMessage({type: "MODEL_READY"});
        }catch(err){
            self.postMessage({
                type: "ERROR",
                error: err.message
            })
        }
    }

    else if(type === "PROCESS_AUDIO"){
        if(inferenceSession === null){
            self.postMessage({
                type: "ERROR",
                error: "Model not loaded. Send LOAD_MODEL first"
            })
            return;
      }
      try{
        // payload.chunk: Float32Array of 144000 samples
        const tensor = new ort.Tensor("float32", payload.chunk, [1, 144000]);
        const feeds = {};
        feeds[inferenceSession.inputNames[0]] = tensor;
        const results = await inferenceSession.run(feeds);
        const logits = results[inferenceSession.outputNames[0]].data;

        // Applying sigmoid
        const confidences = Array.from(logits).map(l=>1/(1+Math.exp(-l)));
        self.postMessage({
            type: "CHUNK_RESULT",
            chunkIndex: payload.chunkIndex,
            confidences: confidences,
            labels: labels
        });
      }catch(err){
        self.postMessage({
            type: "ERROR",
            error: err.message
        })
      }
    }
};