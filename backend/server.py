import os
import io
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from pydub import AudioSegment
import multiprocessing as mp
from birdnet_model import load_acoustic_model
from birdnet_model import load_geo_model
import uvicorn
from log_sighting import log_sighting
from contextlib import asynccontextmanager

pool = None

@asynccontextmanager
async def load_model():
    global pool
    pool = mp.Pool(processes=1, initializer=init_worker)
    pool.apply(lambda: None) # block until models are loaded in the worker process
    try:
        yield
    finally:
        pool.close()
        pool.join()

app = FastAPI(lifespan=load_model)

app.add_middleware(
    CORSMiddleware,
    allow_origins = ["*"],
    allow_credentials = True,
    allow_headers = ["*"],
    allow_methods = ["*"],
)

def init_worker():
    global geo_model, acoustic_model
    acoustic_model = load_acoustic_model()
    geo_model = load_geo_model()

def delete_file(filePath: Path):
    try:
        if filePath.exists():
            os.remove(filePath)
            print(f"Successfully cleaned up file: {filePath}")
        else:
            print(f"{filePath} is already deleted")
    except Exception as e:
        print(f"Error occurred while deleting file: {filePath} and the error is {e}")

def passing_data_to_model(audio_file_path: str, lat: float, lon:float, num_week: int):
    filter_set = None
    if lat is not None and lon is not None:
        num_week = num_week if num_week > 0 else -1
        geo_result = geo_model.predict(
            lat,
            lon,
            week = num_week,
            min_confidence = 0.05 # minimum confidence score
        )
        filter_set = set(geo_result["species_name"])
    predictions = acoustic_model.predict(
            audio_file_path,
            custom_species_list = filter_set,
            min_confidence = 0.25,
            overlap = 1.5,
    )
    return predictions

@app.post("/api/identify")
async def receive_data_from_frontend(
    backgroundtasks: BackgroundTasks, 
    audio_file: UploadFile = File(...),
    lat: float|None = Form(None),
    lon: float|None = Form(None),
    week: int|None = Form(None),
    ):
    if not audio_file.content_type or not audio_file.content_type.startswith("audio/"):
        raise HTTPException(
            status_code = 400, 
            detail = "supplied file should be an audio file"
            )
    backend_dir_path = Path(__file__).parent
    temp_dir_path = backend_dir_path/"temp_audio"
    temp_dir_path.mkdir(parents = True, exist_ok = True)
    base_name = Path(audio_file.filename).stem if audio_file.filename else "recording"
    output_wav_path = temp_dir_path/f"{base_name}.wav"
    try:
        audio_bytes = await audio_file.read()
        memory_buffer = io.BytesIO(audio_bytes)
        incoming_audio_format = "webm" # default format for bowser based recordings
        # extracting webm from audio/webm or mp3 from audio/mp3
        if audio_file.content_type:
            incoming_audio_format = audio_file.content_type.split("/")[-1]
        elif audio_file.filename and "." in audio_file.filename:
            incoming_audio_format = audio_file.filename.split(".")[-1]

        # fixing common browser error where content_type is audio/webm;codecs=opus
        if ";" in incoming_audio_format:
            incoming_audio_format = incoming_audio_format.split(";")[0]
        #loading the audio file directly from the frontned
        audio = AudioSegment.from_file(memory_buffer, format = incoming_audio_format)
        audio.export(output_wav_path, format = "wav")
        backgroundtasks.add_task(delete_file, output_wav_path)
        acoustic_result = pool.apply(passing_data_to_model, args = (str(output_wav_path), lat, lon, week))
        predictions = acoustic_result.to_list()
        if not predictions:
            raise HTTPException(
                status_code = 422,
                detail = "No birds detected"
            )
        predictions_sorted = sorted(predictions, key=lambda x: x["confidence"], reverse=True)
        for item in predictions_sorted:
            log_sighting(item["species_name"], item["confidence"], lat, lon)

        return{
            "species": predictions_sorted[0]["species_name"],
            "confidence": predictions_sorted[0]["confidence"],
            "alternative": [
                {"species": res["species_name"], "confidence": res["confidence"]}
                for res in predictions_sorted[1:4]
            ]
        }

    except Exception as e:
        if output_wav_path.exists():
            os.remove(output_wav_path)
        raise HTTPException(
            status_code = 500,
            detail = f"Error ocurred while creating .wav file: {str(e)}"
        )

if __name__ == "__main__":
    uvicorn.run("server:app", host = "0.0.0.0", port = 8000, reload =True)