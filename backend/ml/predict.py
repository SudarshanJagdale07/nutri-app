#!/usr/bin/env python3
# backend/ml/predict.py
# Robust wrapper for YOLO model prediction that always prints a single JSON object.

import sys
import json
import os

def json_out(obj):
    # Ensure only one JSON line is printed as the last non-empty line
    print(json.dumps(obj))
    sys.stdout.flush()

def main():
    try:
        # Validate args
        if len(sys.argv) < 2:
            json_out({"success": False, "error": "No image path provided"})
            return 1

        image_path = sys.argv[1]
        if not os.path.exists(image_path):
            json_out({"success": False, "error": f"Image not found: {image_path}"})
            return 1

        # Model path(s) - adjust names if you use different filenames
        base_dir = os.path.dirname(os.path.abspath(__file__))
        model_candidates = [
            os.path.join(base_dir, "best.pt"),
            os.path.join(base_dir, "yolov8n-cls.pt"),
            os.path.join(base_dir, "model.pt")
        ]
        model_path = None
        for p in model_candidates:
            if os.path.exists(p):
                model_path = p
                break

        if model_path is None:
            json_out({"success": False, "error": "No model file found in ml/ (expected best.pt or yolov8n-cls.pt)"})
            return 1

        # Try importing ultralytics
        try:
            from ultralytics import YOLO
        except Exception as e:
            json_out({"success": False, "error": "ultralytics import failed", "details": str(e)})
            return 1

        # Load model
        try:
            model = YOLO(model_path)
        except Exception as e:
            json_out({"success": False, "error": f"Failed to load model: {model_path}", "details": str(e)})
            return 1

        # Run prediction
        try:
            results = model.predict(source=image_path, verbose=False)
            if not results or len(results) == 0:
                json_out({"success": False, "error": "No results from model"})
                return 1

            r = results[0]
            # Attempt to extract top prediction name and confidence robustly
            dish = None
            confidence = None
            try:
                # ultralytics classification result shape may vary; try common fields
                if hasattr(r, "probs") and hasattr(r.probs, "top1"):
                    top_idx = r.probs.top1
                    dish = r.names[top_idx] if hasattr(r, "names") else str(top_idx)
                    confidence = float(getattr(r.probs, "top1conf", 0.0))
                elif hasattr(r, "boxes") and len(r.boxes) > 0:
                    # detection model fallback: take highest score box label
                    box = r.boxes[0]
                    label_idx = int(box.cls[0]) if hasattr(box, "cls") else None
                    dish = r.names[label_idx] if label_idx is not None and hasattr(r, "names") else None
                    confidence = float(box.conf[0]) if hasattr(box, "conf") else None
                else:
                    # fallback: try r.names and r.probs as dict-like
                    dish = getattr(r, "name", None) or None
            except Exception:
                pass

            # Build response
            out = {"success": True}
            if dish is not None:
                out["dish"] = str(dish)
            if confidence is not None:
                out["confidence"] = round(float(confidence), 3)
            # include a small nutrition placeholder if you compute it elsewhere
            out["note"] = "Model ran successfully"
            json_out(out)
            return 0

        except Exception as e:
            json_out({"success": False, "error": "Prediction failed", "details": str(e)})
            return 1

    except Exception as e:
        # Catch-all
        try:
            json_out({"success": False, "error": "Unexpected script error", "details": str(e)})
        except Exception:
            print(json.dumps({"success": False, "error": "Fatal error"}))
        return 1

if __name__ == "__main__":
    sys.exit(main())