import sys
import json
import os
from ultralytics import YOLO

def predict_food():
    # 1. Get the absolute path to the model (sitting in the same folder as this script)
    # This ensures it finds 'best.pt' even when called from Node.js
    base_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(base_dir, "best.pt")
    
    # 2. Check if the model file exists to prevent a crash
    if not os.path.exists(model_path):
        print(json.dumps({"error": f"Model file not found at {model_path}"}))
        sys.exit(1)

    try:
        # 3. Load the YOLOv8 classification model
        model = YOLO(model_path)

        # 4. Get the image path from the command line argument sent by Node.js
        if len(sys.argv) < 2:
            print(json.dumps({"error": "No image path provided"}))
            sys.exit(1)
            
        image_path = sys.argv[1]

        # 5. Run prediction
        # We use verbose=False to keep the output clean for JSON parsing
        results = model.predict(source=image_path, verbose=False)

        # 6. Extract the top prediction and confidence
        result = results[0]
        top_index = result.probs.top1
        dish_name = result.names[top_index]
        confidence = float(result.probs.top1conf)

        # 7. Print ONLY the JSON result to stdout
        # Your Node.js script captures this specific line
        print(json.dumps({
            "dish": dish_name,
            "confidence": round(confidence, 2)
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    predict_food()