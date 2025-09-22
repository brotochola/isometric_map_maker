# Isometric Map Maker

https://brotochola.github.io/isometric_map_maker

A browser-based editor for creating isometric scenes and maps. Build scenes by placing image assets with proper depth sorting and isometric alignment guides.

## Features

### File Operations

- **Add Images**: Load multiple image files to use as scene objects
- **Add Background**: Set a tiling image as repeating background
- **Load Scene**: Load saved scenes (JSON + image files)
- **Export JSON**: Export scene data without embedded images
- **Export JSON + Assets**: Export scene with embedded image data

### Item Management

- **Drag & Drop**: Move items around the scene
- **Auto Z-Index**: Automatic depth sorting based on isometric horizon
- **Item Duplication**: Clone items while dragging
- **Item Flipping**: Mirror items horizontally
- **Background Pinning**: Lock items to background layer
- **Item Deletion**: Remove items from scene

### Navigation & Camera

- **Panning**: Move camera view around large scenes
- **Zooming**: Zoom in/out with mouse wheel (0.1x - 3x)
- **Keyboard Camera**: Move camera with WASD keys

### Visual Aids

- **Isometric Guides**: Display alignment lines for hovered items
- **Grid Overlay**: Show isometric grid for precise placement
- **Grid Angle**: Adjust grid angle (45° - 90°)
- **Grid Size**: Adjust grid spacing (10px - 120px)

### Undo System

- Undo last 20 actions including moves, additions, deletions, and flips

## Controls

### Mouse

- **Left Click + Drag**: Move items
- **Alt + Left Click + Drag**: Duplicate item while moving
- **Mouse Wheel**: Zoom in/out
- **Middle Mouse + Drag**: Pan camera
- **Spacebar + Mouse Drag**: Pan camera
- **Hover**: Show isometric guide lines for item

### Keyboard

- **Ctrl/Cmd + Z**: Undo last action
- **Delete**: Remove hovered item
- **T** or **R**: Flip hovered item horizontally
- **B**: Toggle background pin for hovered item
- **Arrow Keys**: Move hovered item by 1px increments
- **Spacebar**: Enable panning mode
- **W/A/S/D**: Move camera (W=down, S=up, A=left, D=right)

### Toolbar Buttons

- **📁 Add Images**: Select multiple image files to add
- **🖼️ Add Background**: Select tiling background image
- **📂 Load Scene**: Load JSON scene file with images
- **📄 Export JSON**: Download scene positions only
- **📦 Export JSON + Assets**: Download scene with embedded images
- **Show Grid**: Toggle grid overlay visibility

### Grid Controls

- **Grid Angle Slider/Input**: Adjust isometric angle (45°-90°)
- **Grid Size Slider/Input**: Adjust grid spacing (10px-120px)

## File Formats

### Supported Images

- PNG, JPG, GIF, and other browser-supported image formats
- Images are positioned by their bottom-center point for isometric alignment

### Scene Files

- JSON format containing item positions, grid settings, and camera state
- Can include embedded base64 image data or reference external image files
- Backwards compatible with older scene formats

### Export Options

1. **JSON Only**: Scene data without images (smaller file, requires original images)
2. **JSON + Assets**: Complete scene with embedded images (larger file, fully portable)

## Scene Structure

Items are positioned using:

- **X/Y coordinates**: Bottom-center point of each image
- **Z-index**: Automatic depth sorting based on isometric horizon
- **Flip state**: Horizontal mirroring
- **Background flag**: Whether item is pinned to background layer
