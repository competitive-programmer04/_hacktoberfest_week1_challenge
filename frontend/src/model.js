const CACHE_NAME = "birdnet-pwa-cache-v1";
const MODEL_URL = "https://huggingface.co/tphakala/BirdNET-v2.4/resolve/main/BirdNET_v2.4_int8_arm.onnx";
const LABELS_URL = "https://huggingface.co/tphakala/BirdNET-v2.4/resolve/main/labels.txt";

let worker;
let labels = [];

export async function initModel(onProgress){
    worker = new Worker(new URL("./inference-worker.js", import.meta.url));
    const cache = await caches.open(CACHE_NAME);
    const cachedModel = await cache.match(MODEL_URL);
    const cachedLabels = await cache.match(LABELS_URL);
    let modelBuffer;

    if(!cachedModel || !cachedLabels){
        // First visit: download the model and cache
        onProgress({status: "downloading", percent: 0});
        const response = await fetch(MODEL_URL);
        if(!response.ok){
            throw new Error(`Download failed: ${response.status}`);
        }
        const contentLength = response.headers.get("content-length");
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        const reader = response.body.getReader();
        let received = 0;
        const chunks = [];
        while(true){
            const {done, value} = await reader.read();
            if(done) break;
            chunks.push(value);
            received = received + value.length;
            if(total>0){
                onProgress({status: "downloading the birdnet model", percent: Math.round((received/total)*100)});
            }
        }
        const allChunks = new Uint8Array(received);
        let position = 0;
        for(const chunk of chunks){
            allChunks.set(chunk, position);
            position = position + chunk.length;
        }
        modelBuffer = allChunks.buffer;
        // Cache it
        await cache.put(MODEL_URL, new Response(modelBuffer.slice(0)));
        // labels
        const labelsResponse = await fetch(LABELS_URL);
        await cache.put(LABELS_URL, labelsResponse.clone());
        const labelsText = await labelsResponse.text();
        labels = parseLabels(labelsText);
    }
    else{
        // cache hit
        onProgress({status: "loading it...", percent: 100});
        modelBuffer = await cachedModel.arrayBuffer();
        const labelsText = await cachedLabels.text();
        labels = parseLabels(labelsText);
    }

    // send to worker
    onProgress({status: "compiling it...", percent: 100});
    worker.postMessage({
        type: "LOAD_MODEL",
        payload: {modelBuffer, labels}
    }, [modelBuffer]);
    return new Promise((resolve, reject)=>{
        const handler = (e)=>{
            if(e.data.type === "MODEL_READY"){
                worker.removeEventListener("message", handler);
                resolve();
            }
            else if(e.data.type === "ERROR"){
                worker.removeEventListener("message", handler);
                reject(new Error(e.data.error));
            }
        };
        worker.addEventListener("message", handler);
    });
}

export function analyzeChunks(audioChunk, chunkIndex){
    return new Promise((resolve, reject)=>{
        const handler = (e)=>{
            const {type, chunkIndex: returnedIndex} = e.data;
            if(type === "CHUNK_RESULT" && returnedIndex === chunkIndex){
                worker.removeEventListener("message", handler);
                resolve({
                    confidences: e.data.confidences,
                    labels: e.data.labels
                });
            }

            else if(type === "ERROR"){
                worker.removeEventListener("message", handler);
                reject(new Error(e.data.error));
            }
        };
        worker.addEventListener("message", handler);
        worker.postMessage({
            type: "PROCESS_AUDIO",
            payload:{
                chunk: audioChunk,
                chunkIndex,
            },
        }, [audioChunk.buffer]);
    });
}

function parseLabels(text){
    return text.split('\n').map(l=>l.trim()).filter(l=>l.length > 0);
}