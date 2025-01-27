import uvicorn
from main import app
import webbrowser
import threading
import time


def open_browser():
    time.sleep(1.5)  # Wait for server to start
    webbrowser.open("http://localhost:8000")


if __name__ == "__main__":
    # Start browser in a separate thread
    threading.Thread(target=open_browser).start()

    # Start FastAPI server
    uvicorn.run(app, host="localhost", port=8000)
