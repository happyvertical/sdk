#!/usr/bin/env python3
"""
EasyOCR Worker Script for @have/pdf

This script provides a bridge between Node.js and EasyOCR Python library.
It accepts JSON commands via stdin and returns JSON results via stdout.

Requirements:
- Python 3.6+
- easyocr package (pip install easyocr)

Communication Protocol:
- Input: JSON objects via stdin, one per line
- Output: JSON responses via stdout, one per line
- Errors: JSON error objects with "error" field

Example Input:
{
  "command": "detect",
  "image_data": "base64_encoded_image_data",
  "languages": ["en"],
  "options": {}
}

Example Output:
{
  "success": true,
  "results": [
    {
      "text": "detected text",
      "confidence": 0.95,
      "bbox": [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
    }
  ]
}
"""

import sys
import json
import base64
import tempfile
import os
from typing import List, Dict, Any, Optional
import logging

# Configure logging to stderr so it doesn't interfere with stdout communication
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)

logger = logging.getLogger(__name__)

class EasyOCRWorker:
    def __init__(self):
        self.reader = None
        self.current_languages = None
        
    def initialize_reader(self, languages: List[str]) -> bool:
        """Initialize EasyOCR reader with specified languages"""
        try:
            # Only reinitialize if languages changed
            if self.reader is not None and self.current_languages == languages:
                return True
                
            import easyocr
            self.reader = easyocr.Reader(languages, gpu=False)  # Use CPU to avoid GPU dependency
            self.current_languages = languages
            logger.info(f"EasyOCR reader initialized with languages: {languages}")
            return True
            
        except ImportError:
            logger.error("EasyOCR not installed. Install with: pip install easyocr")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize EasyOCR reader: {str(e)}")
            return False
    
    def detect_text(self, image_data: str, languages: List[str], options: Dict[str, Any]) -> Dict[str, Any]:
        """Detect text in image using EasyOCR"""
        try:
            # Initialize reader if needed
            if not self.initialize_reader(languages):
                return {
                    "success": False,
                    "error": "Failed to initialize EasyOCR reader"
                }
            
            # Decode base64 image data
            try:
                image_bytes = base64.b64decode(image_data)
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Invalid base64 image data: {str(e)}"
                }
            
            # Write image to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as temp_file:
                temp_file.write(image_bytes)
                temp_path = temp_file.name
            
            try:
                # Perform OCR detection
                results = self.reader.readtext(temp_path)
                
                # Format results
                formatted_results = []
                for result in results:
                    bbox, text, confidence = result
                    formatted_results.append({
                        "text": text,
                        "confidence": float(confidence),
                        "bbox": bbox  # EasyOCR returns bbox as list of [x,y] coordinates
                    })
                
                return {
                    "success": True,
                    "results": formatted_results
                }
                
            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_path)
                except:
                    pass
            
        except Exception as e:
            logger.error(f"OCR detection failed: {str(e)}")
            return {
                "success": False,
                "error": f"OCR detection failed: {str(e)}"
            }
    
    def check_dependencies(self) -> Dict[str, Any]:
        """Check if EasyOCR dependencies are available"""
        try:
            import easyocr
            
            # Only check if the package can be imported, don't initialize it
            # (initialization downloads models and takes too long for a dependency check)
            
            return {
                "success": True,
                "easyocr_version": easyocr.__version__ if hasattr(easyocr, '__version__') else 'unknown',
                "available_languages": []  # Don't get languages list since that requires initialization
            }
            
        except ImportError:
            return {
                "success": False,
                "error": "EasyOCR not installed. Install with: pip install easyocr"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"EasyOCR dependency check failed: {str(e)}"
            }
    
    def process_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """Process a single command"""
        cmd_type = command.get('command')
        
        if cmd_type == 'detect':
            return self.detect_text(
                command.get('image_data', ''),
                command.get('languages', ['en']),
                command.get('options', {})
            )
        elif cmd_type == 'check_dependencies':
            return self.check_dependencies()
        else:
            return {
                "success": False,
                "error": f"Unknown command: {cmd_type}"
            }
    
    def run(self):
        """Main worker loop - process commands from stdin"""
        try:
            for line in sys.stdin:
                line = line.strip()
                if not line:
                    continue
                
                try:
                    # Parse JSON command
                    command = json.loads(line)
                    
                    # Process command
                    result = self.process_command(command)
                    
                    # Send JSON response
                    print(json.dumps(result))
                    sys.stdout.flush()
                    
                except json.JSONDecodeError as e:
                    error_response = {
                        "success": False,
                        "error": f"Invalid JSON input: {str(e)}"
                    }
                    print(json.dumps(error_response))
                    sys.stdout.flush()
                    
                except Exception as e:
                    logger.error(f"Unexpected error processing command: {str(e)}")
                    error_response = {
                        "success": False,
                        "error": f"Internal error: {str(e)}"
                    }
                    print(json.dumps(error_response))
                    sys.stdout.flush()
                    
        except KeyboardInterrupt:
            logger.info("Worker interrupted by user")
        except Exception as e:
            logger.error(f"Worker failed: {str(e)}")
            sys.exit(1)

if __name__ == "__main__":
    worker = EasyOCRWorker()
    worker.run()