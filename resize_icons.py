from PIL import Image
import os

try:
    img_path = "icon.png"
    if not os.path.exists(img_path):
        print(f"Error: {img_path} not found.")
        exit(1)

    img = Image.open(img_path)
    
    sizes = [16, 32, 48, 128]
    
    for size in sizes:
        new_img = img.resize((size, size), Image.Resampling.LANCZOS)
        output_name = f"icon{size}.png"
        new_img.save(output_name)
        print(f"Generated {output_name}")

except Exception as e:
    print(f"Error resizing images: {e}")
