import birdnet
from functools import lru_cache

@lru_cache(maxsize=1)
def load_acoustic_model():
    return birdnet.load("acoustic", "2.4", "tf", library="litert")

@lru_cache(maxsize=1)
def load_geo_model():
    return birdnet.load("geo", "2.4", "tf", library="litert")