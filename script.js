const editor = document.getElementById("editor");
const editorContainer = document.getElementById("editor-container");
const fileInput = document.getElementById("fileInput");
const tilingInput = document.getElementById("tilingInput");
const tilingBtn = document.getElementById("tilingBtn");
const loadSceneInput = document.getElementById("loadSceneInput");
const loadSceneBtn = document.getElementById("loadSceneBtn");
const exportWithAssetsBtn = document.getElementById("exportWithAssetsBtn");
const exportWithoutAssetsBtn = document.getElementById(
  "exportWithoutAssetsBtn"
);
const angleSlider = document.getElementById("angleSlider");
const angleInput = document.getElementById("angleInput");
const gridSizeSlider = document.getElementById("gridSizeSlider");
const gridSizeInput = document.getElementById("gridSizeInput");
const gridCheckbox = document.getElementById("gridCheckbox");
const assetManagerBtn = document.getElementById("assetManagerBtn");
const assetPanel = document.getElementById("assetPanel");
const closeAssetPanel = document.getElementById("closeAssetPanel");
const assetList = document.getElementById("assetList");
const replaceAssetInput = document.getElementById("replaceAssetInput");

let items = []; // {id, type, x, y, el}
let tilingSprite = null; // {id, el, width, height}
let typeCounters = {}; // Track count of each type
// assetsPool stores a single dataURL per image type to avoid duplicating base64 strings
// format: { [type]: dataURL }
let assetsPool = {};
let hoveredItem = null; // Track currently hovered item for deletion
let guideLineAngle = 60; // Current guide line angle in degrees
let gridSize = 80; // Current grid size in pixels
let gridElement = null; // Grid overlay element
let tooltip = null; // Item info tooltip element
// Undo stack
let undoStack = [];
const UNDO_LIMIT = 20;
let isPerformingUndo = false; // Prevent recording actions while undoing

function pushAction(action) {
  if (isPerformingUndo) return;
  undoStack.push(action);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

// Create tooltip element
function createTooltip() {
  if (tooltip) return tooltip;

  tooltip = document.createElement("div");
  tooltip.id = "item-tooltip";
  document.body.appendChild(tooltip);
  return tooltip;
}

// Show tooltip with item information
function showTooltip(item, mouseEvent) {
  if (!tooltip) createTooltip();

  // Get item dimensions and properties
  const itemWidth =
    parseFloat(item.el.style.getPropertyValue("--item-width")) || 0;
  const itemHeight =
    parseFloat(item.el.style.getPropertyValue("--item-height")) || 0;
  const zIndex = item.el.style.zIndex || "auto";
  const transform = item.el.style.transform || "scaleX(1)";
  const scaleX = transform.includes("scaleX(-1)") ? "-1" : "1";

  // Format position values
  const positionX = Math.round(item.x);
  const positionY = Math.round(item.y);

  // Create tooltip content
  const tooltipContent = `
    <div class="tooltip-row">
      <span class="tooltip-label">Type:</span>
      <span class="tooltip-value">${item.type}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">Position:</span>
      <span class="tooltip-value">${positionX}, ${positionY}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">Size:</span>
      <span class="tooltip-value">${Math.round(itemWidth)} × ${Math.round(
    itemHeight
  )}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">Z-Index:</span>
      <span class="tooltip-value">${zIndex}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">ScaleX:</span>
      <span class="tooltip-value">${scaleX}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">Background:</span>
      <span class="tooltip-value">${item.background ? "Yes" : "No"}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">Isometric:</span>
      <span class="tooltip-value">${item.isometric ? "Yes" : "No"}</span>
    </div>
  `;

  tooltip.innerHTML = tooltipContent;
  tooltip.classList.add("show");

  // Position tooltip at the right-top corner of the item
  // Get item position (center-X, bottom-Y in new coordinate system)
  const itemCenterX =
    parseFloat(item.el.style.getPropertyValue("--item-x")) || 0;
  const itemBottomY =
    parseFloat(item.el.style.getPropertyValue("--item-y")) || 0;

  // Convert item coordinates to viewport coordinates (accounting for zoom and pan)
  const containerRect = editorContainer.getBoundingClientRect();

  // Calculate item's right-top position in viewport coordinates
  // itemCenterX is center, so right edge = center + width/2
  const itemRightX =
    (itemCenterX + itemWidth / 2) * zoomLevel +
    editorOffsetX +
    containerRect.left;
  // itemBottomY is bottom, so top edge = bottom - height
  const itemTopY =
    (itemBottomY - itemHeight) * zoomLevel + editorOffsetY + containerRect.top;

  // Small offset from the item's edge
  const offsetX = 8;
  const offsetY = -8;

  tooltip.style.left = itemRightX + offsetX + "px";
  tooltip.style.top = itemTopY + offsetY + "px";

  // Adjust position if tooltip would go off screen
  const tooltipRect = tooltip.getBoundingClientRect();
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  if (tooltipRect.right > windowWidth) {
    // Position to the left of the item instead
    // itemCenterX is center, so left edge = center - width/2
    const itemLeftX =
      (itemCenterX - itemWidth / 2) * zoomLevel +
      editorOffsetX +
      containerRect.left;
    tooltip.style.left = itemLeftX - tooltipRect.width - offsetX + "px";
  }

  if (tooltipRect.top < 0) {
    // Position below the item instead
    // itemBottomY is already bottom Y
    const itemBottomViewportY =
      itemBottomY * zoomLevel + editorOffsetY + containerRect.top;
    tooltip.style.top = itemBottomViewportY + offsetX + "px";
  }
}

// Hide tooltip
function hideTooltip() {
  if (tooltip) {
    tooltip.classList.remove("show");
  }
}

// Helper to recreate an item from saved data (used for undo delete)
function recreateItemFromData(data) {
  const div = document.createElement("div");
  // Prefer assetsPool entry for the type, fall back to embedded src if present
  const imageSrc = assetsPool[data.type] || data.src;
  div.className = "item";
  div.style.setProperty("--item-x", data.x + "px");
  div.style.setProperty("--item-y", data.y + "px");
  // Set image for CSS background-image and shadow
  div.style.setProperty("--item-image", `url(${imageSrc})`);

  // Create temporary image to get dimensions and set them on the div
  const tempImg = new Image();
  tempImg.onload = () => {
    div.style.setProperty("--item-width", tempImg.naturalWidth + "px");
    div.style.setProperty("--item-height", tempImg.naturalHeight + "px");
  };
  tempImg.src = imageSrc;

  if (data.flipped) div.style.transform = "scaleX(-1)";
  editor.appendChild(div);

  if (!typeCounters[data.type]) typeCounters[data.type] = 0;

  // Check for backward compatibility - if ID doesn't contain "__", it's from previous version
  if (!data.id.toString().includes("__")) {
    // Rewrite old format ID to new format
    typeCounters[data.type]++;
    data.id = data.type + "__" + typeCounters[data.type];
    console.log(`Converted old ID to new format during undo: ${data.id}`);
  } else {
    // Extract numeric part from ID (e.g., "tree__3" -> 3)
    const idParts = data.id.toString().split("__");
    const numericId = parseInt(idParts[idParts.length - 1]) || 0;
    typeCounters[data.type] = Math.max(typeCounters[data.type], numericId);
  }

  const newItem = {
    id: data.id,
    type: data.type,
    x: data.x,
    y: data.y,
    el: div,
    flipped: !!data.flipped,
    background: !!data.background,
    isometric: !!data.isometric,
  };
  if (newItem.background) {
    div.classList.add("background");
    div.style.zIndex = "1";
  }

  items.push(newItem);
  makeDraggable(div, newItem);
  updateAllZIndexes();
  updateItemHorizon(newItem);
  return newItem;
}

function undo() {
  if (undoStack.length === 0) return;
  const action = undoStack.pop();
  isPerformingUndo = true;
  try {
    if (action.type === "add") {
      const idx = items.findIndex(
        (i) => i.id === action.item.id && i.type === action.item.type
      );
      if (idx !== -1) {
        const it = items[idx];
        removeGuideLines(it);
        it.el.remove();
        items.splice(idx, 1);
      }
      updateAllZIndexes();
    } else if (action.type === "delete") {
      recreateItemFromData(action.item);
    } else if (action.type === "move") {
      const it = items.find(
        (i) => i.id === action.itemId && i.type === action.itemType
      );
      if (it) {
        it.x = action.from.x;
        it.y = action.from.y;
        it.el.style.setProperty("--item-x", it.x + "px");
        it.el.style.setProperty("--item-y", it.y + "px");
        updateAllZIndexes();
        positionGuideLines(it, {
          left: document.getElementById(`guide-left-${it.id}-${it.type}`),
          right: document.getElementById(`guide-right-${it.id}-${it.type}`),
          horiz: document.getElementById(`guide-h-${it.id}-${it.type}`),
        });
      }
    } else if (action.type === "flip") {
      const it = items.find(
        (i) => i.id === action.itemId && i.type === action.itemType
      );
      if (it) {
        it.flipped = action.previousFlipped;
        it.el.style.transform = it.flipped
          ? "translate(-50%, -100%) scaleX(-1)"
          : "translate(-50%, -100%)";
      }
    } else if (action.type === "background") {
      const it = items.find(
        (i) => i.id === action.itemId && i.type === action.itemType
      );
      if (it) {
        it.background = action.previousBackground;
        if (it.background) {
          it.el.classList.add("background");
          it.el.style.zIndex = "1";
        } else {
          it.el.classList.remove("background");
          updateAllZIndexes();
        }
      }
    } else if (action.type === "isometric") {
      const it = items.find(
        (i) => i.id === action.itemId && i.type === action.itemType
      );
      if (it) {
        it.isometric = action.previousIsometric;
        updateAllZIndexes();
        updateItemHorizon(it);

        // Refresh guide lines if this item is currently hovered
        if (
          hoveredItem &&
          hoveredItem.id === it.id &&
          hoveredItem.type === it.type
        ) {
          showGuideLines(it);
        }
      }
    } else if (action.type === "tiling-add") {
      if (tilingSprite) {
        tilingSprite.el.remove();
        tilingSprite = null;
      }
    } else if (action.type === "tiling-remove") {
      const data = action.data;
      // Prefer assets from action snapshot, then global pool, then embedded originalSrc
      const src =
        (action.assets && action.assets[data.type]) ||
        assetsPool[data.type] ||
        data.originalSrc;
      const tilingDiv = document.createElement("div");
      tilingDiv.style.position = "absolute";
      tilingDiv.style.left = "0px";
      tilingDiv.style.top = "0px";
      tilingDiv.style.width = "100%";
      tilingDiv.style.height = "100%";
      tilingDiv.style.backgroundImage = `url(${src})`;
      tilingDiv.style.backgroundRepeat = "repeat";
      if (data.width) tilingDiv.style.backgroundSize = `${data.width}px`;
      tilingDiv.style.pointerEvents = "none";
      tilingDiv.style.zIndex = "1";
      editor.appendChild(tilingDiv);
      // Check for backward compatibility - convert old tiling sprite ID format
      let tilingId = data.id;
      if (!tilingId.toString().includes("__")) {
        tilingId = data.type + "__tiling";
        console.log(
          `Converted old tiling sprite ID to new format during undo: ${tilingId}`
        );
      }

      tilingSprite = {
        id: tilingId,
        type: data.type,
        el: tilingDiv,
        width: data.width,
        height: data.height,
        originalSrc: src,
      };
    } else if (action.type === "clear-scene") {
      // Restore assets snapshot if present so recreated items can reference them
      if (action.assets && typeof action.assets === "object") {
        assetsPool = Object.assign({}, action.assets);
      }
      // recreate items
      if (action.items && Array.isArray(action.items)) {
        action.items.forEach((d) => recreateItemFromData(d));
      }
      // recreate tiling if present
      if (action.tiling) {
        const data = action.tiling;
        const src =
          (action.assets && action.assets[data.type]) ||
          assetsPool[data.type] ||
          data.originalSrc;
        const tilingDiv = document.createElement("div");
        tilingDiv.style.position = "absolute";
        tilingDiv.style.left = "0px";
        tilingDiv.style.top = "0px";
        tilingDiv.style.width = "100%";
        tilingDiv.style.height = "100%";
        tilingDiv.style.backgroundImage = `url(${src})`;
        tilingDiv.style.backgroundRepeat = "repeat";
        if (data.width) tilingDiv.style.backgroundSize = `${data.width}px`;
        tilingDiv.style.pointerEvents = "none";
        tilingDiv.style.zIndex = "1";
        editor.appendChild(tilingDiv);
        // Check for backward compatibility - convert old tiling sprite ID format
        let tilingId = data.id;
        if (!tilingId.toString().includes("__")) {
          tilingId = data.type + "__tiling";
          console.log(
            `Converted old tiling sprite ID to new format during clear-scene undo: ${tilingId}`
          );
        }

        tilingSprite = {
          id: tilingId,
          type: data.type,
          el: tilingDiv,
          width: data.width,
          height: data.height,
          originalSrc: src,
        };
      }
    }
  } finally {
    isPerformingUndo = false;
  }
}

// Panning variables
let isPanning = false;
let isSpacePressed = false;
let isMiddleMousePressed = false;
let panStartX = 0;
let panStartY = 0;
let editorOffsetX = 0;
let editorOffsetY = 0;

// Zoom variables
let zoomLevel = 1;
const minZoom = 0.1;
const maxZoom = 3;
const zoomStep = 0.1;

// Function to update z-index for all items based on their bottom position
function updateAllZIndexes() {
  // Calculate z-index based on each item's isometric horizon Y
  const editorRect = editor.getBoundingClientRect();
  items.forEach((item) => {
    const el = item.el;
    // If item is pinned as background, keep it at z-index 1
    if (item.background) {
      el.style.zIndex = "1";
      return;
    }
    // item center-X, bottom-Y in editor coordinates (CSS variables store editor coords)
    const itemX = parseFloat(el.style.getPropertyValue("--item-x")) || 0;
    const itemY = parseFloat(el.style.getPropertyValue("--item-y")) || 0;
    const itemHeight =
      parseFloat(el.style.getPropertyValue("--item-height")) || el.offsetHeight;

    const itemWidth =
      parseFloat(el.style.getPropertyValue("--item-width")) || el.offsetWidth;

    // Compute horizon distance from bottom of the image (px)
    // itemY is already bottom Y, so we use it directly for default mode
    let horizonY;
    if (item.isometric) {
      // Isometric mode: horizon at bottom minus width * 0.29
      horizonY = itemY - itemWidth * 0.29;
    } else {
      // Default top-down mode: horizon at bottom of image (itemY is already bottom)
      horizonY = itemY;
    }

    // Use horizonY relative to editor's top for stacking
    const relativeHorizon = horizonY - editorRect.top;

    // Assign zIndex based on the horizon position (floor to integer)
    el.style.zIndex = Math.floor(relativeHorizon).toString();
  });
}

// Function to create guide lines for an item
function createGuideLines(item) {
  // Create left guide line
  const leftLine = document.createElement("div");
  leftLine.className = "guide-line";
  leftLine.id = `guide-left-${item.id}-${item.type}`;
  leftLine.style.transform = `rotate(${-guideLineAngle}deg)`;
  editor.appendChild(leftLine);

  // Create right guide line
  const rightLine = document.createElement("div");
  rightLine.className = "guide-line";
  rightLine.id = `guide-right-${item.id}-${item.type}`;
  rightLine.style.transform = `rotate(${guideLineAngle}deg)`;
  editor.appendChild(rightLine);

  // Create horizontal guide line at the horizon y
  const horizLine = document.createElement("div");
  horizLine.className = "h-guide-line";
  horizLine.id = `guide-h-${item.id}-${item.type}`;
  editor.appendChild(horizLine);

  return { left: leftLine, right: rightLine, horiz: horizLine };
}

// Function to position guide lines at the center bottom of an item
function positionGuideLines(item, guideLines) {
  // Get item position in editor coordinates (already center-X, bottom-Y)
  const centerX = parseFloat(item.el.style.getPropertyValue("--item-x")) || 0;
  const bottomY = parseFloat(item.el.style.getPropertyValue("--item-y")) || 0;
  const itemWidth =
    parseFloat(item.el.style.getPropertyValue("--item-width")) ||
    item.el.offsetWidth;
  const itemHeight =
    parseFloat(item.el.style.getPropertyValue("--item-height")) ||
    item.el.offsetHeight;

  // Calculate line height (guide lines are in editor coordinate system)
  // Make lines long enough to be visible across the entire editor area
  const lineHeight = Math.max(2000, window.innerWidth + window.innerHeight);

  // Position both lines at the center bottom of the item
  // Guide lines inherit the editor's transform, so use editor coordinates directly
  [guideLines.left, guideLines.right].forEach((line) => {
    line.style.left = centerX - 1 + "px"; // -1 to center the 2px wide line
    line.style.top = bottomY - lineHeight / 2 + "px"; // Center the line at the intersection point
    line.style.height = lineHeight + "px";
  });

  // Position horizontal guide line at the computed horizon Y (editor coords)
  const horizLine = document.getElementById(`guide-h-${item.id}-${item.type}`);
  if (horizLine) {
    // Use same logic as z-index calculation for horizon position
    // bottomY is already the bottom coordinate in the new system
    let horizonY;
    if (item.isometric) {
      // Isometric mode: horizon at bottom minus width * 0.29
      horizonY = bottomY - itemWidth * 0.29;
    } else {
      // Default top-down mode: horizon at bottom of image (bottomY is already bottom)
      horizonY = bottomY;
    }

    horizLine.style.left = "0px";
    horizLine.style.width = "100%";
    horizLine.style.top = horizonY - 1 + "px"; // -1 to center 2px height
    horizLine.style.display = "block";
  }
}

// Function to hide guide lines from all items
function hideAllGuideLines() {
  items.forEach((otherItem) => {
    hideGuideLines(otherItem);
  });
}

// Function to show guide lines for an item
function showGuideLines(item) {
  // console.log("showGuideLines called for:", item.id, item.type);

  // First, hide guide lines from all other items to ensure only one item shows guides
  hideAllGuideLines();

  // Check if guide lines already exist
  let leftLine = document.getElementById(`guide-left-${item.id}-${item.type}`);
  let rightLine = document.getElementById(
    `guide-right-${item.id}-${item.type}`
  );

  if (!leftLine || !rightLine) {
    // console.log("Creating new guide lines");
    const guideLines = createGuideLines(item);
    leftLine = guideLines.left;
    rightLine = guideLines.right;
  } else {
    // console.log("Using existing guide lines");
  }

  // Position and show the lines
  const horizLine = document.getElementById(`guide-h-${item.id}-${item.type}`);
  positionGuideLines(item, {
    left: leftLine,
    right: rightLine,
    horiz: horizLine,
  });
  leftLine.style.display = "block";
  rightLine.style.display = "block";
  if (horizLine) horizLine.style.display = "block";
  // console.log("Guide lines should now be visible");
}

// Function to hide guide lines for an item
function hideGuideLines(item) {
  const leftLine = document.getElementById(
    `guide-left-${item.id}-${item.type}`
  );
  const rightLine = document.getElementById(
    `guide-right-${item.id}-${item.type}`
  );

  const horizLine = document.getElementById(`guide-h-${item.id}-${item.type}`);
  if (leftLine) leftLine.style.display = "none";
  if (rightLine) rightLine.style.display = "none";
  if (horizLine) horizLine.style.display = "none";
}

// Function to remove guide lines for an item (when item is deleted)
function removeGuideLines(item) {
  const leftLine = document.getElementById(
    `guide-left-${item.id}-${item.type}`
  );
  const rightLine = document.getElementById(
    `guide-right-${item.id}-${item.type}`
  );

  const horizLine = document.getElementById(`guide-h-${item.id}-${item.type}`);
  if (leftLine) leftLine.remove();
  if (rightLine) rightLine.remove();
  if (horizLine) horizLine.remove();
}

// Function to delete an item
function deleteItem(item) {
  console.log("Deleting item:", item.id, item.type);

  // Remove guide lines
  removeGuideLines(item);

  // Remove the element from DOM
  item.el.remove();

  // Remove from items array
  const index = items.findIndex(
    (i) => i.id === item.id && i.type === item.type
  );
  if (index !== -1) {
    items.splice(index, 1);
  }

  // Push delete action with item data so it can be restored
  try {
    // Save only type reference instead of full src when possible
    const itemDataForUndo = {
      id: item.id,
      type: item.type,
      x: item.x,
      y: item.y,
      flipped: item.flipped,
      background: item.background,
      isometric: item.isometric,
    };
    // If no asset in pool for this type, include src to ensure undo works
    if (!assetsPool[item.type]) itemDataForUndo.src = item.el.src;
    pushAction({ type: "delete", item: itemDataForUndo });
  } catch (err) {
    console.warn("Failed to push delete action", err);
  }

  // Clear hovered item if it was the deleted one
  if (hoveredItem === item) {
    hoveredItem = null;
  }

  // Update z-indexes after deletion
  updateAllZIndexes();

  console.log("Item deleted successfully");
}

// Function to clear the current scene
function clearScene() {
  // Snapshot current scene for undo
  try {
    const itemsSnapshot = items.map((it) => ({
      id: it.id,
      type: it.type,
      x: it.x,
      y: it.y,
      src: it.el.src,
      flipped: it.flipped,
      background: it.background,
    }));
    const tilingSnapshot = tilingSprite
      ? {
          id: tilingSprite.id,
          type: tilingSprite.type,
          width: tilingSprite.width,
          height: tilingSprite.height,
          originalSrc: tilingSprite.originalSrc,
        }
      : null;
    // Snapshot assets that are currently used so undo can restore them without embedding multiple copies
    const assetsSnapshot = Object.assign({}, assetsPool);
    pushAction({
      type: "clear-scene",
      items: itemsSnapshot,
      tiling: tilingSnapshot,
      assets: assetsSnapshot,
    });
  } catch (err) {
    console.warn("Failed to push clear-scene action", err);
  }

  // Remove all items and their guide lines
  items.forEach((item) => {
    removeGuideLines(item);
    item.el.remove();
  });
  items = [];

  // Remove tiling sprite if exists
  if (tilingSprite) {
    tilingSprite.el.remove();
    tilingSprite = null;
  }

  // Remove grid if exists
  if (gridElement) {
    gridElement.remove();
    gridElement = null;
    gridCheckbox.checked = false;
  }

  // Reset type counters
  typeCounters = {};
}

fileInput.addEventListener("change", (e) => {
  for (const file of e.target.files) {
    // Create object URL directly from file (much more efficient than base64)
    const objectURL = URL.createObjectURL(file);
    const div = document.createElement("div");
    div.className = "item";
    // Set image for CSS background-image and shadow
    div.style.setProperty("--item-image", `url(${objectURL})`);

    editor.appendChild(div);

    const type = file.name.split(".")[0];

    // Register asset in pool if not present
    if (!assetsPool[type]) {
      assetsPool[type] = objectURL;
    }

    // Initialize counter for this type if it doesn't exist
    if (!typeCounters[type]) {
      typeCounters[type] = 0;
    }

    // Increment counter and use it as id
    typeCounters[type]++;
    const id = type + "__" + typeCounters[type];

    // Create temporary image to get dimensions for positioning
    const tempImg = new Image();
    tempImg.onload = () => {
      // Calculate center X and bottom Y (new positioning system)
      const x = (-editorOffsetX + window.innerWidth / 2) / zoomLevel;
      const y = (-editorOffsetY + window.innerHeight / 2) / zoomLevel;

      // Set div dimensions to match image
      div.style.setProperty("--item-width", tempImg.naturalWidth + "px");
      div.style.setProperty("--item-height", tempImg.naturalHeight + "px");

      const item = {
        id,
        type,
        x, // Now stores center X
        y, // Now stores bottom Y
        el: div,
        flipped: false,
        isometric: false,
      };

      div.style.setProperty("--item-x", x + "px");
      div.style.setProperty("--item-y", y + "px");

      items.push(item);

      // Record add action for undo. Save only a type reference; include src only if pool missing
      const addData = {
        id: item.id,
        type: item.type,
        x: item.x,
        y: item.y,
        flipped: false,
        background: false,
        isometric: false,
      };
      pushAction({ type: "add", item: addData });

      makeDraggable(div, item);

      // Update z-indexes and horizon after adding new item
      updateAllZIndexes();
      updateItemHorizon(item);
    };

    // Start loading the image to get dimensions
    tempImg.src = objectURL;
  }
});

// Tiling sprite functionality
tilingBtn.addEventListener("click", () => {
  tilingInput.click();
});

// Load scene functionality
loadSceneBtn.addEventListener("click", () => {
  loadSceneInput.click();
});

// Panning and zoom functionality
function updateEditorPosition() {
  editor.style.transformOrigin = "0 0";

  // Limit left and top edges
  if (editorOffsetX > 0) {
    editorOffsetX = 0;
  }
  if (editorOffsetY > 0) {
    editorOffsetY = 0;
  }

  // Calculate editor and viewport dimensions
  const editorWidth = 10 * window.innerWidth; // 1000vw
  const editorHeight = 10 * window.innerHeight; // 1000vh
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight - 40; // minus toolbar height

  // Calculate scaled editor dimensions
  const scaledEditorWidth = editorWidth * zoomLevel;
  const scaledEditorHeight = editorHeight * zoomLevel;

  // Limit right and bottom edges
  const minOffsetX = -(scaledEditorWidth - viewportWidth);
  const minOffsetY = -(scaledEditorHeight - viewportHeight);

  if (editorOffsetX < minOffsetX) {
    editorOffsetX = minOffsetX;
  }
  if (editorOffsetY < minOffsetY) {
    editorOffsetY = minOffsetY;
  }

  editor.style.transform = `translate(${editorOffsetX}px, ${editorOffsetY}px) scale(${zoomLevel})`;
}

// Function to flip an item horizontally
function flipItem(item) {
  console.log("Flipping item:", item.id, item.type);

  // Toggle flipped state
  item.flipped = !item.flipped;

  // Apply CSS transform (combine with translate)
  if (item.flipped) {
    item.el.style.transform = "translate(-50%, -100%) scaleX(-1)";
  } else {
    item.el.style.transform = "translate(-50%, -100%)";
  }

  console.log("Item flipped state:", item.flipped);
}

// Keyboard event listeners for spacebar, delete, and flip
document.addEventListener("keydown", (e) => {
  // Handle Ctrl+Z for undo
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (e.key === " " && !isSpacePressed) {
    e.preventDefault();
    isSpacePressed = true;
    editorContainer.classList.add("panning");
    hideTooltip(); // Hide tooltip when entering panning mode
  } else if (e.key === "Delete" && hoveredItem) {
    e.preventDefault();
    deleteItem(hoveredItem);
  } else if (e.key.toLowerCase() === "t" || e.key.toLowerCase() === "r") {
    if (hoveredItem) {
      e.preventDefault();
      // record previous flipped state
      const prev = hoveredItem.flipped;
      flipItem(hoveredItem);
      pushAction({
        type: "flip",
        itemId: hoveredItem.id,
        itemType: hoveredItem.type,
        previousFlipped: prev,
      });
    }
  } else if (e.key.toLowerCase() === "b") {
    // Toggle background pin on hovered item
    if (hoveredItem) {
      e.preventDefault();
      const prevBg = !!hoveredItem.background;
      hoveredItem.background = !hoveredItem.background;
      if (hoveredItem.background) {
        hoveredItem.el.classList.add("background");
        hoveredItem.el.style.zIndex = "1";
      } else {
        hoveredItem.el.classList.remove("background");
        // Recalculate z-indexes for this item
        updateAllZIndexes();
      }
      pushAction({
        type: "background",
        itemId: hoveredItem.id,
        itemType: hoveredItem.type,
        previousBackground: prevBg,
      });
    }
  } else if (e.key.toLowerCase() === "h") {
    // Toggle isometric horizon on hovered item
    if (hoveredItem) {
      e.preventDefault();
      const prevIsometric = !!hoveredItem.isometric;
      hoveredItem.isometric = !hoveredItem.isometric;

      // Update z-indexes and transform-origin after changing isometric mode
      updateAllZIndexes();
      updateItemHorizon(hoveredItem);

      // Refresh guide lines to show updated horizon position
      showGuideLines(hoveredItem);

      pushAction({
        type: "isometric",
        itemId: hoveredItem.id,
        itemType: hoveredItem.type,
        previousIsometric: prevIsometric,
      });
    }
  } else if (
    hoveredItem &&
    (e.key === "ArrowUp" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight")
  ) {
    // Move hovered item 1px with arrow keys
    e.preventDefault();
    hideTooltip(); // Hide tooltip when moving item with arrow keys

    // Store original position for undo
    const fromX = hoveredItem.x;
    const fromY = hoveredItem.y;

    // Calculate new position based on arrow key
    let newX = hoveredItem.x;
    let newY = hoveredItem.y;

    switch (e.key) {
      case "ArrowUp":
        newY -= 1;
        break;
      case "ArrowDown":
        newY += 1;
        break;
      case "ArrowLeft":
        newX -= 1;
        break;
      case "ArrowRight":
        newX += 1;
        break;
    }

    // Update item position
    hoveredItem.x = newX;
    hoveredItem.y = newY;
    hoveredItem.el.style.setProperty("--item-x", newX + "px");
    hoveredItem.el.style.setProperty("--item-y", newY + "px");

    // Update guide lines if they're visible
    const leftLine = document.getElementById(
      `guide-left-${hoveredItem.id}-${hoveredItem.type}`
    );
    const rightLine = document.getElementById(
      `guide-right-${hoveredItem.id}-${hoveredItem.type}`
    );
    const horizLine = document.getElementById(
      `guide-h-${hoveredItem.id}-${hoveredItem.type}`
    );

    if (
      leftLine &&
      rightLine &&
      (leftLine.style.display === "block" ||
        rightLine.style.display === "block")
    ) {
      positionGuideLines(hoveredItem, {
        left: leftLine,
        right: rightLine,
        horiz: horizLine,
      });
    }

    // Update z-indexes to maintain proper layering
    updateAllZIndexes();

    // Record move action for undo
    pushAction({
      type: "move",
      itemId: hoveredItem.id,
      itemType: hoveredItem.type,
      from: { x: fromX, y: fromY },
      to: { x: newX, y: newY },
    });
  } else if (
    e.key.toLowerCase() === "w" ||
    e.key.toLowerCase() === "a" ||
    e.key.toLowerCase() === "s" ||
    e.key.toLowerCase() === "d"
  ) {
    // WASD camera movement (10px per keypress)
    e.preventDefault();
    hideTooltip(); // Hide tooltip when moving camera with WASD

    switch (e.key.toLowerCase()) {
      case "s":
        // Move camera up (show content above)
        editorOffsetY -= 10 / zoomLevel;
        break;
      case "w":
        // Move camera down (show content below)
        editorOffsetY += 10 / zoomLevel;
        break;
      case "a":
        // Move camera left (show content on the left)
        editorOffsetX += 10 / zoomLevel;
        break;
      case "d":
        // Move camera right (show content on the right)
        editorOffsetX -= 10 / zoomLevel;
        break;
    }

    // Apply the camera movement
    updateEditorPosition();
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === " ") {
    e.preventDefault();
    isSpacePressed = false;
    isPanning = false;
    editorContainer.classList.remove("panning");
  }
});

// Mouse event listeners for panning
editorContainer.addEventListener("mousedown", (e) => {
  // Handle middle mouse button press
  if (e.button === 1) {
    e.preventDefault();
    isMiddleMousePressed = true;
    editorContainer.classList.add("panning");
    hideTooltip(); // Hide tooltip when entering panning mode with middle mouse
  }

  // Handle panning with either spacebar or middle mouse button
  if ((isSpacePressed || isMiddleMousePressed) && !isPanning) {
    e.preventDefault();
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    editorContainer.style.cursor = "grabbing";
    hideTooltip(); // Hide tooltip when starting to pan
  }
});

// Prevent context menu on middle mouse button
editorContainer.addEventListener("contextmenu", (e) => {
  if (isMiddleMousePressed) {
    e.preventDefault();
  }
});

// Reset middle mouse state when window loses focus to prevent stuck panning
window.addEventListener("blur", () => {
  if (isMiddleMousePressed) {
    isMiddleMousePressed = false;
    isPanning = false;
    editorContainer.classList.remove("panning");
    editorContainer.style.cursor = "";
  }
});

document.addEventListener("mousemove", (e) => {
  if (isPanning && (isSpacePressed || isMiddleMousePressed)) {
    e.preventDefault();
    hideTooltip(); // Ensure tooltip stays hidden during panning
    const deltaX = e.clientX - panStartX;
    const deltaY = e.clientY - panStartY;

    editorOffsetX += deltaX;
    editorOffsetY += deltaY;

    panStartX = e.clientX;
    panStartY = e.clientY;

    updateEditorPosition();
  }
});

document.addEventListener("mouseup", (e) => {
  // Handle middle mouse button release
  if (e.button === 1 && isMiddleMousePressed) {
    e.preventDefault();
    isMiddleMousePressed = false;
    editorContainer.classList.remove("panning");
  }

  if (isPanning) {
    e.preventDefault();
    isPanning = false;
    editorContainer.style.cursor = "";
  }
});

// Helper function to convert object URLs to base64 data URLs for export
async function convertObjectUrlToDataUrl(objectUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      resolve(dataUrl);
    };
    img.onerror = () =>
      reject(new Error(`Failed to load object URL: ${objectUrl}`));
    img.src = objectUrl;
  });
}

// Helper function to convert base64 data URL to object URL for editing
function convertDataUrlToObjectUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          resolve(objectUrl);
        } else {
          reject(new Error("Failed to create blob from canvas"));
        }
      }, "image/png");
    };
    img.onerror = () => reject(new Error(`Failed to load data URL`));
    img.src = dataUrl;
  });
}

// Helper function to convert base64 data URLs to object URLs in assets pool for editing
async function convertAssetsForEditing(assetsPool) {
  const convertedAssets = {};
  const conversionPromises = [];

  for (const [type, url] of Object.entries(assetsPool)) {
    if (url && url.startsWith("data:")) {
      // Convert base64 to object URL for better performance during editing
      const conversionPromise = convertDataUrlToObjectUrl(url)
        .then((objectUrl) => {
          convertedAssets[type] = objectUrl;
          console.log(
            `Converted ${type} from base64 to object URL for editing`
          );
        })
        .catch((err) => {
          console.error(`Failed to convert ${type} to object URL:`, err);
          // Keep original as fallback
          convertedAssets[type] = url;
        });
      conversionPromises.push(conversionPromise);
    } else {
      // Keep as is (already object URL or other format)
      convertedAssets[type] = url;
    }
  }

  await Promise.all(conversionPromises);
  return convertedAssets;
}

// Helper function to convert all object URLs in assets pool to base64 for export
async function convertAssetsForExport(assetsPool) {
  const convertedAssets = {};
  const conversionPromises = [];

  for (const [type, url] of Object.entries(assetsPool)) {
    if (url && url.startsWith("blob:")) {
      // Convert object URL to base64
      const conversionPromise = convertObjectUrlToDataUrl(url)
        .then((dataUrl) => {
          convertedAssets[type] = dataUrl;
          console.log(`Converted ${type} from object URL to base64`);
        })
        .catch((err) => {
          console.error(`Failed to convert ${type} to base64:`, err);
          // NEVER save blob URLs - throw error instead of fallback
          throw new Error(
            `Unable to convert ${type} to base64 for export. Export aborted to prevent saving blob URLs.`
          );
        });
      conversionPromises.push(conversionPromise);
    } else if (url && !url.startsWith("data:")) {
      // Reject any URLs that are not base64 data URLs
      throw new Error(
        `Asset ${type} contains non-base64 data (${url.substring(
          0,
          50
        )}...). Only base64 data URLs are allowed for export.`
      );
    } else {
      // Keep as is (already base64 or other format)
      convertedAssets[type] = url;
    }
  }

  await Promise.all(conversionPromises);
  return convertedAssets;
}

async function buildExportData(includeAssets) {
  console.log("Export started. Items count:", items.length);
  console.log("Tiling sprite exists:", !!tilingSprite);

  const itemsData = items.map((i) => {
    // Item coordinates are already center-X, bottom-Y (matches export format)
    const itemData = { id: i.id, type: i.type, x: i.x, y: i.y };
    if (i.flipped) {
      itemData.scaleX = -1;
    }
    if (i.background) {
      itemData.background = true;
    }
    if (i.isometric) {
      itemData.isometric = true;
    }
    return itemData;
  });

  console.log("Exported items data:", itemsData);

  const exportData = {
    items: itemsData,
    tilingSprite: tilingSprite
      ? {
          id: tilingSprite.id,
          type: tilingSprite.type,
          width: tilingSprite.width,
          height: tilingSprite.height,
        }
      : null,
    gridAngle: guideLineAngle,
    gridSize: gridSize,
    gridVisible: gridCheckbox.checked,
    // Save camera/view state
    camera: {
      zoomLevel: zoomLevel,
      offsetX: editorOffsetX,
      offsetY: editorOffsetY,
    },
  };

  if (includeAssets) {
    // Ensure all currently used assets are in the pool
    const usedTypes = new Set();

    // Collect types from items
    items.forEach((item) => usedTypes.add(item.type));

    // Add tiling sprite type if exists
    if (tilingSprite) {
      usedTypes.add(tilingSprite.type);
    }

    // Verify all used types have assets in the pool and recover missing ones
    const missingAssets = [];
    const recoveredAssets = {};

    usedTypes.forEach((type) => {
      if (!assetsPool[type]) {
        missingAssets.push(type);
        console.warn(`Missing asset for type: ${type}, attempting recovery...`);

        // Try to recover asset from DOM elements
        let recoveredSrc = null;

        // Check items for this type
        const itemWithType = items.find((item) => item.type === type);
        if (itemWithType && itemWithType.el && itemWithType.el.src) {
          recoveredSrc = itemWithType.el.src;
          console.log(`Recovered asset for ${type} from item DOM element`);
        }

        // Check tiling sprite if this is a tiling type
        if (!recoveredSrc && tilingSprite && tilingSprite.type === type) {
          if (tilingSprite.originalSrc) {
            recoveredSrc = tilingSprite.originalSrc;
            console.log(
              `Recovered asset for ${type} from tiling sprite originalSrc`
            );
          } else if (tilingSprite.el) {
            // Try to extract from background-image CSS property
            const bgImage = tilingSprite.el.style.backgroundImage;
            if (bgImage && bgImage.startsWith("url(")) {
              recoveredSrc = bgImage.slice(4, -1).replace(/["']/g, "");
              console.log(
                `Recovered asset for ${type} from tiling sprite CSS background-image`
              );
            }
          }
        }

        if (recoveredSrc) {
          if (recoveredSrc.startsWith("data:")) {
            // Already base64, use directly
            recoveredAssets[type] = recoveredSrc;
            console.log(
              `Successfully recovered base64 asset for type: ${type}`
            );
          } else if (recoveredSrc.startsWith("blob:")) {
            // Object URL, needs conversion to base64 for export
            console.log(`Converting object URL to base64 for export: ${type}`);
            // We'll convert this in the next step
            recoveredAssets[type] = recoveredSrc; // Temporarily store object URL
          } else {
            console.error(`Unsupported asset URL format for type: ${type}`);
          }
        } else {
          console.error(`Could not recover asset for type: ${type}`);
        }
      }
    });

    // Merge recovered assets back into the pool for export
    const completeAssetsPool = { ...assetsPool, ...recoveredAssets };

    // Debug logging
    console.log("Assets pool keys:", Object.keys(assetsPool));
    console.log("Used types:", Array.from(usedTypes));
    console.log("Missing assets:", missingAssets);
    console.log("Recovered assets:", Object.keys(recoveredAssets));

    // Store recovered assets back in the main pool for future use
    Object.assign(assetsPool, recoveredAssets);

    // Filter assets pool to only include used assets
    const usedAssetsPool = {};
    usedTypes.forEach((type) => {
      if (completeAssetsPool[type]) {
        usedAssetsPool[type] = completeAssetsPool[type];
      }
    });

    console.log("Filtering assets for export...");
    console.log(
      "Total assets available:",
      Object.keys(completeAssetsPool).length
    );
    console.log("Used assets to export:", Object.keys(usedAssetsPool).length);
    console.log(
      "Filtered out unused assets:",
      Object.keys(completeAssetsPool).length -
        Object.keys(usedAssetsPool).length
    );

    // Convert object URLs to base64 data URLs for export
    console.log("Converting used assets for export...");
    const convertedAssetsPool = await convertAssetsForExport(usedAssetsPool);
    exportData.assets = convertedAssetsPool;
    console.log(
      "Final exported assets count:",
      Object.keys(exportData.assets).length
    );
  }

  return exportData;
}

function triggerExport(exportObj, filename) {
  // Show user-friendly export summary
  if (exportObj.assets) {
    const assetTypes = Object.keys(exportObj.assets);
    const totalSize = Object.values(exportObj.assets).reduce(
      (total, asset) => total + (asset ? asset.length : 0),
      0
    );

    const summary = `Export Summary:
• ${exportObj.items.length} item(s)
• ${assetTypes.length} asset type(s): ${assetTypes.join(", ")}
• ${exportObj.tilingSprite ? "1 tiling background" : "No tiling background"}
• Total file size: ~${Math.round(totalSize / 1024)}KB
• Background-pinned items: ${
      exportObj.items.filter((i) => i.background).length
    }`;

    console.log(summary);

    // Show a brief user notification (optional - could be replaced with a toast notification)
    if (assetTypes.length > 0) {
      console.log(
        `✅ Successfully exporting ${assetTypes.length} asset types with data`
      );
    }
  }

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);

  console.log("Export completed successfully");
}

exportWithAssetsBtn.addEventListener("click", async () => {
  try {
    console.log("Starting export with assets...");
    const data = await buildExportData(true);

    // Final validation before export
    const validation = validateExportCompleteness(data);
    if (!validation.isComplete) {
      console.warn("Export validation warnings:", validation.warnings);
      // Still proceed with export but show warnings
    }

    triggerExport(data, "isometric_scene_with_assets.json");
    console.log("Export with assets completed successfully");
  } catch (error) {
    console.error("Export with assets failed:", error);
    alert("Export failed. Check console for details.");
  }
});

// Validation function to ensure export completeness
function validateExportCompleteness(exportData) {
  const warnings = [];

  // Check if all items have corresponding assets
  if (exportData.assets) {
    const assetTypes = Object.keys(exportData.assets);
    const itemTypes = new Set(exportData.items.map((item) => item.type));

    itemTypes.forEach((type) => {
      if (!assetTypes.includes(type)) {
        warnings.push(`Missing asset for item type: ${type}`);
      }
    });

    // Check tiling sprite asset
    if (
      exportData.tilingSprite &&
      !assetTypes.includes(exportData.tilingSprite.type)
    ) {
      warnings.push(
        `Missing asset for tiling sprite type: ${exportData.tilingSprite.type}`
      );
    }

    // Check for empty/invalid assets - only base64 data URLs are allowed
    assetTypes.forEach((type) => {
      const asset = exportData.assets[type];
      if (!asset) {
        warnings.push(`Empty asset for type: ${type}`);
      } else if (asset.startsWith("blob:")) {
        warnings.push(
          `CRITICAL: Blob URL detected for type: ${type} - export should be rejected!`
        );
      } else if (!asset.startsWith("data:")) {
        warnings.push(
          `Invalid asset format for type: ${type} - only base64 data URLs are allowed`
        );
      }
    });
  }

  return {
    isComplete: warnings.length === 0,
    warnings: warnings,
  };
}

exportWithoutAssetsBtn.addEventListener("click", async () => {
  try {
    console.log("Starting export without assets...");
    const data = await buildExportData(false);
    triggerExport(data, "isometric_scene.json");
    console.log("Export without assets completed successfully");
  } catch (error) {
    console.error("Export without assets failed:", error);
    alert("Export failed. Check console for details.");
  }
});

// Zoom functionality with mouse wheel
function handleZoom(e, mouseX, mouseY) {
  e.preventDefault();
  hideTooltip(); // Hide tooltip when zooming

  const zoomDelta = e.deltaY > 0 ? -zoomStep : zoomStep;
  const oldZoom = zoomLevel;
  const newZoom = Math.max(minZoom, Math.min(maxZoom, zoomLevel + zoomDelta));

  if (newZoom === oldZoom) return; // No change needed

  // Get mouse position relative to editor container
  const containerRect = editorContainer.getBoundingClientRect();
  const mouseX_rel = mouseX - containerRect.left;
  const mouseY_rel = mouseY - containerRect.top;

  // The key insight: find what point in the original editor coordinate system is under the mouse
  // Then ensure that same point stays under the mouse after zoom
  const worldX = (mouseX_rel - editorOffsetX) / oldZoom;
  const worldY = (mouseY_rel - editorOffsetY) / oldZoom;

  // Update zoom
  zoomLevel = newZoom;

  // Adjust offset so the world point stays under the mouse
  editorOffsetX = mouseX_rel - worldX * newZoom;
  editorOffsetY = mouseY_rel - worldY * newZoom;

  updateEditorPosition();
}

// Mouse wheel event listener
editorContainer.addEventListener("wheel", (e) => {
  handleZoom(e, e.clientX, e.clientY);
});

tilingInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];

    // Remove existing tiling sprite if any
    if (tilingSprite) {
      // record previous tiling so it can be restored
      try {
        pushAction({
          type: "tiling-remove",
          data: {
            id: tilingSprite.id,
            type: tilingSprite.type,
            width: tilingSprite.width,
            height: tilingSprite.height,
            originalSrc: tilingSprite.originalSrc,
          },
        });
      } catch (err) {
        console.warn(err);
      }
      tilingSprite.el.remove();
      tilingSprite = null;
    }

    // Create tiling data for the new sprite
    const type = file.name.split(".")[0];
    const tilingData = {
      id: type + "__tiling",
      type: type,
    };

    // Reuse the loadTilingSprite function
    loadTilingSprite(file, tilingData);
  }
});

// Load scene input handler
loadSceneInput.addEventListener("change", (e) => {
  if (e.target.files.length === 0) return;

  const files = Array.from(e.target.files);
  const jsonFile = files.find((file) =>
    file.name.toLowerCase().endsWith(".json")
  );
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));

  if (!jsonFile) {
    alert("Please select a JSON file along with the images.");
    // Clear the input value to allow reselection
    e.target.value = "";
    return;
  }

  // Clear current scene
  clearScene();

  // Read the JSON file
  const jsonReader = new FileReader();
  jsonReader.onload = async (event) => {
    try {
      const sceneData = JSON.parse(event.target.result);
      await loadScene(sceneData, imageFiles);
      // Clear the input value after successful loading to allow loading another scene
      e.target.value = "";
      console.log("Scene loaded successfully");
    } catch (error) {
      console.error("Error loading scene:", error);
      alert("Error loading scene: " + error.message);
      // Clear the input value even on error to allow retry
      e.target.value = "";
    }
  };
  jsonReader.readAsText(jsonFile);
});

// Function to load a scene from JSON data and image files
async function loadScene(sceneData, imageFiles) {
  // Create a map of image files by their base name (without extension)
  const imageMap = {};
  imageFiles.forEach((file) => {
    const baseName = file.name.split(".")[0];
    imageMap[baseName] = file;
  });

  // Load grid settings if they exist in the scene data
  if (sceneData.gridAngle !== undefined) {
    updateAngle(sceneData.gridAngle);
  }
  if (sceneData.gridSize !== undefined) {
    updateGridSize(sceneData.gridSize);
  }
  if (sceneData.gridVisible !== undefined) {
    gridCheckbox.checked = sceneData.gridVisible;
    toggleGrid(); // Apply the grid visibility state
  }

  // Load camera/view state if it exists in the scene data
  if (sceneData.camera) {
    if (sceneData.camera.zoomLevel !== undefined) {
      zoomLevel = sceneData.camera.zoomLevel;
    }
    if (sceneData.camera.offsetX !== undefined) {
      editorOffsetX = sceneData.camera.offsetX;
    }
    if (sceneData.camera.offsetY !== undefined) {
      editorOffsetY = sceneData.camera.offsetY;
    }
    // Apply the loaded camera state
    updateEditorPosition();
  }

  // If the scene includes an assets map, populate assetsPool
  if (sceneData.assets && typeof sceneData.assets === "object") {
    console.log(
      "Converting loaded assets from base64 to object URLs for editing..."
    );
    // Convert base64 assets to object URLs for better performance
    const convertedAssets = await convertAssetsForEditing(sceneData.assets);
    Object.keys(convertedAssets).forEach((k) => {
      if (!assetsPool[k]) assetsPool[k] = convertedAssets[k];
    });
  }

  // Load tiling sprite if exists. Prefer assetsPool, otherwise look for uploaded image file
  if (sceneData.tilingSprite) {
    if (assetsPool[sceneData.tilingSprite.type]) {
      // Create tiling from pool
      const tilingDiv = document.createElement("div");
      tilingDiv.style.position = "absolute";
      tilingDiv.style.left = "0px";
      tilingDiv.style.top = "0px";
      tilingDiv.style.width = "100%";
      tilingDiv.style.height = "100%";
      tilingDiv.style.backgroundImage = `url(${
        assetsPool[sceneData.tilingSprite.type]
      })`;
      tilingDiv.style.backgroundRepeat = "repeat";
      if (sceneData.tilingSprite.width)
        tilingDiv.style.backgroundSize = `${sceneData.tilingSprite.width}px`;
      tilingDiv.style.pointerEvents = "none";
      tilingDiv.style.zIndex = "1";
      editor.appendChild(tilingDiv);
      // Check for backward compatibility - convert old tiling sprite ID format
      let tilingId = sceneData.tilingSprite.id;
      if (!tilingId.toString().includes("__")) {
        tilingId = sceneData.tilingSprite.type + "__tiling";
        console.log(
          `Converted old tiling sprite ID to new format: ${tilingId}`
        );
      }

      tilingSprite = {
        id: tilingId,
        type: sceneData.tilingSprite.type,
        el: tilingDiv,
        width: sceneData.tilingSprite.width,
        height: sceneData.tilingSprite.height,
        originalSrc: assetsPool[sceneData.tilingSprite.type],
      };
    } else {
      const tilingImageFile = imageFiles.find(
        (file) => file.name.split(".")[0] === sceneData.tilingSprite.type
      );
      if (tilingImageFile) {
        loadTilingSprite(tilingImageFile, sceneData.tilingSprite);
      } else {
        console.warn(
          `Tiling sprite image file not found for type: ${sceneData.tilingSprite.type}`
        );
      }
    }
  }

  // Load items
  if (sceneData.items) {
    sceneData.items.forEach((itemData) => {
      // Prefer assetsPool for this type; if not available, try uploaded image files
      const imageFile = imageMap[itemData.type];
      if (assetsPool[itemData.type]) {
        // Create item using assetsPool directly
        loadItem(itemData, null);
      } else if (imageFile) {
        loadItem(itemData, imageFile);
      } else {
        console.warn(
          `!!! Image file not found for item type: ${itemData.type}`
        );
        itemData.orphan = true;
        // Still attempt to load if itemData contains embedded src (back-compat)
        loadItem(itemData, null);
      }
    });
  }
}

// Function to load a tiling sprite
function loadTilingSprite(imageFile, tilingData) {
  // Create object URL directly from file (much more efficient than base64)
  const objectURL = URL.createObjectURL(imageFile);
  const img = new Image();
  img.onload = () => {
    console.log("img.naturalWidth", img);

    // Create a div with the tiled background using the image URL directly
    const tilingDiv = document.createElement("div");
    tilingDiv.style.position = "absolute";
    tilingDiv.style.left = "0px";
    tilingDiv.style.top = "0px";
    tilingDiv.style.width = "100%";
    tilingDiv.style.height = "100%";
    tilingDiv.style.backgroundImage = `url(${objectURL})`;
    tilingDiv.style.backgroundRepeat = "repeat";
    tilingDiv.style.backgroundSize = `${img.naturalWidth}px`;
    tilingDiv.style.pointerEvents = "none";
    tilingDiv.style.zIndex = "1";

    editor.appendChild(tilingDiv);

    // Register asset in pool for the tiling type
    if (!assetsPool[tilingData.type]) {
      assetsPool[tilingData.type] = objectURL;
    }

    tilingSprite = {
      id: tilingData.id,
      type: tilingData.type,
      el: tilingDiv,
      width: tilingData.width,
      height: tilingData.height,
      originalSrc: objectURL,
    };
    // Record tiling add for undo
    try {
      pushAction({
        type: "tiling-add",
        data: {
          id: tilingSprite.id,
          type: tilingSprite.type,
          width: tilingSprite.width,
          height: tilingSprite.height,
          originalSrc: tilingSprite.originalSrc,
        },
      });
    } catch (err) {
      console.warn(err);
    }
  };
  img.src = objectURL;
}

// Function to load an individual item
function loadItem(itemData, imageFile) {
  // If an imageFile is provided, use object URL; otherwise use assetsPool or embedded src
  if (imageFile) {
    const objectURL = URL.createObjectURL(imageFile);
    // Register in assets pool for this type if not present
    if (!assetsPool[itemData.type]) {
      assetsPool[itemData.type] = objectURL;
    }
    createItemFromSrc(itemData, objectURL);
  } else {
    // Use pool or embedded src
    const src = assetsPool[itemData.type] || itemData.src || "";
    createItemFromSrc(itemData, src);
  }
}

// Helper to create an item element given preloaded src
function createItemFromSrc(itemData, src) {
  const div = document.createElement("div");
  div.className = "item";

  // Check if we have a valid src, if not use fallback base64 asset
  if (!src || src === "" || src === "url()") {
    src = getFallbackAsset(itemData.type);
  }

  // Set image for CSS background-image and shadow
  div.style.setProperty("--item-image", `url(${src})`);

  // Create temporary image to get dimensions
  const tempImg = new Image();
  tempImg.onload = () => {
    const imgWidth = tempImg.naturalWidth;
    const imgHeight = tempImg.naturalHeight;

    // Set div dimensions to match image
    div.style.setProperty("--item-width", imgWidth + "px");
    div.style.setProperty("--item-height", imgHeight + "px");

    // Store center X and bottom Y directly (matches export format)
    div.style.setProperty("--item-x", itemData.x + "px");
    div.style.setProperty("--item-y", itemData.y + "px");

    editor.appendChild(div);

    // Update type counter to match the loaded item's ID
    if (!typeCounters[itemData.type]) {
      typeCounters[itemData.type] = 0;
    }

    // Check for backward compatibility - if ID doesn't contain "__", it's from previous version
    if (!itemData.id.toString().includes("__")) {
      // Rewrite old format ID to new format
      typeCounters[itemData.type]++;
      itemData.id = itemData.type + "__" + typeCounters[itemData.type];
      console.log(`Converted old ID to new format: ${itemData.id}`);
    } else {
      // Extract numeric part from ID (e.g., "tree__3" -> 3)
      const idParts = itemData.id.toString().split("__");
      const numericId = parseInt(idParts[idParts.length - 1]) || 0;
      typeCounters[itemData.type] = Math.max(
        typeCounters[itemData.type],
        numericId
      );
    }

    const item = {
      id: itemData.id,
      type: itemData.type,
      x: itemData.x, // Now stores center X
      y: itemData.y, // Now stores bottom Y
      el: div,
      flipped: itemData.scaleX === -1,
      background: !!itemData.background,
      isometric: !!itemData.isometric,
    };

    // Apply flip transform if item was flipped (combine with translate)
    if (item.flipped) {
      div.style.transform = "translate(-50%, -100%) scaleX(-1)";
    } else {
      div.style.transform = "translate(-50%, -100%)";
    }

    // Apply background class and z-index if item is marked as background
    if (item.background) {
      div.classList.add("background");
      div.style.zIndex = "1";
    }

    items.push(item);

    makeDraggable(div, item);

    // Update z-indexes after loading
    updateAllZIndexes();
    // Set item horizon pivot based on current grid angle
    updateItemHorizon(item);
  };

  // Handle image load error - use fallback asset instead
  tempImg.onerror = () => {
    console.warn(
      `Failed to load image for item type: ${itemData.type}, using fallback asset`
    );
    src = getFallbackAsset(itemData.type);
    tempImg.src = src;
  };

  // Start loading the image
  tempImg.src = src;
}

// Helper function to get or create fallback asset for missing item types
function getFallbackAsset(itemType) {
  // Base64 fallback image (1x1 transparent pixel)
  const fallbackBase64 =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyAQMAAAAk8RryAAAAAXNSR0IB2cksfwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAANQTFRF/wAAGeIJNwAAAAF0Uk5TlLeEjzsAAAAQSURBVHicY2SAAMZRelDQACloADOPuP3XAAAAAElFTkSuQmCC";

  // Store in assets pool for this type if not already present
  if (!assetsPool[itemType]) {
    assetsPool[itemType] = fallbackBase64;
    console.log(`Created fallback asset for item type: ${itemType}`);
  }

  return assetsPool[itemType];
}

function makeDraggable(el, item) {
  let offsetX,
    offsetY,
    dragging = false;

  // Prevent default drag behavior on the image
  el.addEventListener("dragstart", (e) => e.preventDefault());
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  // Add hover event listeners for guide lines and tooltip
  el.addEventListener("mouseenter", (e) => {
    if (!dragging) {
      // console.log("Showing guide lines for item:", item.id, item.type);
      hoveredItem = item; // Track hovered item for deletion
      showGuideLines(item);
      showTooltip(item, e);
    }
  });

  el.addEventListener("mouseleave", () => {
    if (!dragging) {
      // console.log("Hiding guide lines for item:", item.id, item.type);
      hoveredItem = null; // Clear hovered item
      hideGuideLines(item);
      hideTooltip();
    }
  });

  // No need for mousemove listener since tooltip is anchored to item position

  el.addEventListener("mousedown", (e) => {
    e.preventDefault(); // Prevent default behavior
    if (e.button !== 0) return;
    if (el.classList.contains("background")) return;
    dragging = true;
    hideTooltip(); // Hide tooltip when starting to drag
    const isDuplicating = e.altKey; // Check if Alt key is held

    // Calculate offset using the same coordinate system as mousemove
    const containerRect = editorContainer.getBoundingClientRect();
    const mouseXInContainer = e.clientX - containerRect.left;
    const mouseYInContainer = e.clientY - containerRect.top;

    // Convert to editor coordinates (accounting for pan and zoom)
    const editorMouseX = (mouseXInContainer - editorOffsetX) / zoomLevel;
    const editorMouseY = (mouseYInContainer - editorOffsetY) / zoomLevel;

    // Get current item position
    const currentX = parseFloat(el.style.getPropertyValue("--item-x")) || 0;
    const currentY = parseFloat(el.style.getPropertyValue("--item-y")) || 0;

    // Calculate offset between mouse and item position
    offsetX = editorMouseX - currentX;
    offsetY = editorMouseY - currentY;

    let currentEl = el;
    let currentItem = item;

    // store drag start position to later create move action
    if (currentItem) {
      currentItem._dragFrom = { x: currentItem.x, y: currentItem.y };
    }

    if (isDuplicating) {
      // Create a duplicate
      const newImg = el.cloneNode(true);
      newImg.style.setProperty(
        "--item-x",
        el.style.getPropertyValue("--item-x")
      );
      newImg.style.setProperty(
        "--item-y",
        el.style.getPropertyValue("--item-y")
      );

      newImg.style.opacity = "0.8";
      // Ensure duplicates do not inherit the background/pinned state visually
      newImg.classList.remove("background");
      newImg.style.zIndex = "";
      // Set item image for CSS background-image and shadow (ensure it's preserved after cloning)
      const itemImageUrl = el.style.getPropertyValue("--item-image");
      newImg.style.setProperty("--item-image", itemImageUrl);

      // Copy dimensions from original element
      newImg.style.setProperty(
        "--item-width",
        el.style.getPropertyValue("--item-width")
      );
      newImg.style.setProperty(
        "--item-height",
        el.style.getPropertyValue("--item-height")
      );

      editor.appendChild(newImg);

      // Create new item data with proper type-based id and preserve flip state
      typeCounters[item.type]++;
      const newId = item.type + "__" + typeCounters[item.type];
      // Do not copy the `background` flag to the duplicate (duplicates should be regular items)
      const duplicatedItem = {
        id: newId,
        type: item.type,
        x: item.x,
        y: item.y,
        el: newImg,
        flipped: item.flipped,
        background: false,
        isometric: item.isometric,
      };

      // Apply flip transform if original was flipped
      if (item.flipped) {
        newImg.style.transform += "scaleX(-1)";
      }

      items.push(duplicatedItem);

      // Record duplication as an add action for undo
      try {
        const addItem = {
          id: duplicatedItem.id,
          type: duplicatedItem.type,
          x: duplicatedItem.x,
          y: duplicatedItem.y,
          flipped: duplicatedItem.flipped,
          background: false,
          isometric: duplicatedItem.isometric,
        };
        if (!assetsPool[duplicatedItem.type]) {
          const imageUrl = newImg.style.getPropertyValue("--item-image");
          // Extract URL from CSS url() function
          addItem.src = imageUrl
            .replace(/^url\(['"]?/, "")
            .replace(/['"]?\)$/, "");
        }
        pushAction({ type: "add", item: addItem });
      } catch (err) {
        console.warn("Failed to push duplication action", err);
      }

      // Make the duplicate draggable
      // Preserve transform-origin for the duplicate so pivot stays consistent
      newImg.style.transformOrigin = el.style.transformOrigin || "";
      makeDraggable(newImg, duplicatedItem);

      // Ensure horizon pivot is correct after duplication
      updateItemHorizon(duplicatedItem);

      // We'll be dragging the duplicate, not the original
      currentEl = newImg;
      currentItem = duplicatedItem;

      // Update z-indexes after duplication
      updateAllZIndexes();
    } else {
      // Add visual feedback for normal drag (but not when panning)
      if (!isSpacePressed && !isMiddleMousePressed) {
        el.style.opacity = "0.8";
      }
    }

    // Handle mouse move for this specific drag operation
    const handleMouseMove = (e) => {
      if (!dragging) return;
      e.preventDefault();
      hideTooltip(); // Ensure tooltip stays hidden during item dragging

      // Convert mouse position to editor coordinate system accounting for zoom
      const containerRect = editorContainer.getBoundingClientRect();
      const mouseXInContainer = e.clientX - containerRect.left;
      const mouseYInContainer = e.clientY - containerRect.top;

      // Convert to editor coordinates (accounting for pan and zoom)
      const editorX = (mouseXInContainer - editorOffsetX) / zoomLevel;
      const editorY = (mouseYInContainer - editorOffsetY) / zoomLevel;

      // Apply the offset that was captured on mousedown
      let x = editorX - offsetX;
      let y = editorY - offsetY;

      currentEl.style.setProperty("--item-x", x + "px");
      currentEl.style.setProperty("--item-y", y + "px");
      currentItem.x = x;
      currentItem.y = y;

      // Update guide lines position during drag
      const leftLine = document.getElementById(
        `guide-left-${currentItem.id}-${currentItem.type}`
      );
      const rightLine = document.getElementById(
        `guide-right-${currentItem.id}-${currentItem.type}`
      );
      if (
        leftLine &&
        rightLine &&
        (leftLine.style.display === "block" ||
          rightLine.style.display === "block")
      ) {
        positionGuideLines(currentItem, { left: leftLine, right: rightLine });
      }

      // Update z-indexes during drag to maintain proper layering
      updateAllZIndexes();
    };

    // Handle mouse up for this specific drag operation
    const handleMouseUp = (e) => {
      if (dragging) {
        e.preventDefault();
        dragging = false;

        // Reset visual feedback
        currentEl.style.opacity = "1";

        // Final z-index update after drag completes
        updateAllZIndexes();

        // If the item moved, push a move action with from/to
        if (currentItem) {
          const idKey = currentItem.id;
          const typeKey = currentItem.type;
          // We don't have previous position saved here; capture from event if stored on item
          if (currentItem._dragFrom) {
            const from = {
              x: currentItem._dragFrom.x,
              y: currentItem._dragFrom.y,
            };
            const to = { x: currentItem.x, y: currentItem.y };
            if (from.x !== to.x || from.y !== to.y) {
              pushAction({
                type: "move",
                itemId: idKey,
                itemType: typeKey,
                from,
                to,
              });
            }
            delete currentItem._dragFrom;
          }
        }

        // Remove event listeners
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      }
    };

    // Add event listeners for this drag operation
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  });
}

// Function to create the grid element
function createGrid() {
  if (gridElement) {
    gridElement.remove();
  }

  // Create SVG element for the grid
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.position = "absolute";
  svg.style.left = "0px";
  svg.style.top = "0px";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "10"; // Above tiling background (which is 1), below items
  svg.style.display = "none";

  // Create the grid lines directly without patterns
  const gridSpacing = gridSize; // Use configurable grid size
  const viewportWidth = window.innerWidth * 10;
  const viewportHeight = window.innerHeight * 10;
  const maxDimension = Math.max(viewportWidth, viewportHeight);
  const lineExtent = maxDimension * 1.5; // Lines extend 1.5x the viewport size

  // Convert angle to radians for calculations
  // Guide lines are vertical lines rotated by the angle
  const leftAngleRad = (-guideLineAngle * Math.PI) / 180; // Left guide line angle
  const rightAngleRad = (guideLineAngle * Math.PI) / 180; // Right guide line angle

  // Calculate how many lines we need (reduced from previous implementation)
  const numLines = Math.ceil(maxDimension / gridSpacing);

  // Get the center of the viewport
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;

  const lineWidth = 1;
  const lineColor = "rgba(0, 0, 255, 0.35)";

  // Create left-angled lines (matching left guide line)
  for (let i = -numLines; i <= numLines; i++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");

    // For a rotated vertical line, the direction vector is (sin(angle), cos(angle))
    const dirX = Math.sin(leftAngleRad);
    const dirY = Math.cos(leftAngleRad);

    // Perpendicular direction for spacing lines apart
    const perpX = -dirY;
    const perpY = dirX;

    // Calculate offset for this line
    const offsetDistance = i * gridSpacing;
    const offsetX = offsetDistance * perpX;
    const offsetY = offsetDistance * perpY;

    // Line extends from center + offset in both directions along the direction
    const startX = centerX + offsetX - lineExtent * dirX;
    const startY = centerY + offsetY - lineExtent * dirY;
    const endX = centerX + offsetX + lineExtent * dirX;
    const endY = centerY + offsetY + lineExtent * dirY;

    line.setAttribute("x1", startX.toString());
    line.setAttribute("y1", startY.toString());
    line.setAttribute("x2", endX.toString());
    line.setAttribute("y2", endY.toString());
    line.setAttribute("stroke", lineColor);
    line.setAttribute("stroke-width", lineWidth);

    svg.appendChild(line);
  }

  // Create right-angled lines (matching right guide line)
  for (let i = -numLines; i <= numLines; i++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");

    // For a rotated vertical line, the direction vector is (sin(angle), cos(angle))
    const dirX = Math.sin(rightAngleRad);
    const dirY = Math.cos(rightAngleRad);

    // Perpendicular direction for spacing lines apart
    const perpX = -dirY;
    const perpY = dirX;

    // Calculate offset for this line
    const offsetDistance = i * gridSpacing;
    const offsetX = offsetDistance * perpX;
    const offsetY = offsetDistance * perpY;

    // Line extends from center + offset in both directions along the direction
    const startX = centerX + offsetX - lineExtent * dirX;
    const startY = centerY + offsetY - lineExtent * dirY;
    const endX = centerX + offsetX + lineExtent * dirX;
    const endY = centerY + offsetY + lineExtent * dirY;

    line.setAttribute("x1", startX.toString());
    line.setAttribute("y1", startY.toString());
    line.setAttribute("x2", endX.toString());
    line.setAttribute("y2", endY.toString());
    line.setAttribute("stroke", lineColor);
    line.setAttribute("stroke-width", lineWidth);

    svg.appendChild(line);
  }

  editor.appendChild(svg);
  gridElement = svg;
}

// Function to update grid angle
function updateGridAngle() {
  // Recreate the grid with new angles
  if (gridCheckbox.checked && gridElement) {
    const wasVisible = gridElement.style.display !== "none";
    createGrid();
    if (wasVisible) {
      gridElement.style.display = "block";
    }
  }
}

// Function to toggle grid visibility
function toggleGrid() {
  if (!gridElement) {
    createGrid();
  }

  if (gridCheckbox.checked) {
    gridElement.style.display = "block";
  } else {
    gridElement.style.display = "none";
  }
}

// Function to update all existing guide lines with new angle
function updateAllGuideLineAngles() {
  items.forEach((item) => {
    const leftLine = document.getElementById(
      `guide-left-${item.id}-${item.type}`
    );
    const rightLine = document.getElementById(
      `guide-right-${item.id}-${item.type}`
    );

    if (leftLine) {
      leftLine.style.transform = `rotate(${-guideLineAngle}deg)`;
    }
    if (rightLine) {
      rightLine.style.transform = `rotate(${guideLineAngle}deg)`;
    }
  });
}

// Calculate isometric horizon (vertical distance from image bottom in px)
// Based on image half-width and the current grid angle. If the
// intersection point (where the angled guide line meets the top of
// the image) lies outside the image bounds, the value is clamped.
function calculateIsometricHorizon(img, isometric) {
  const W = img.naturalWidth || img.width || 0;
  const H = img.naturalHeight || img.height || 0;
  if (W === 0 || H === 0) return 0;

  if (isometric) {
    // Isometric mode: use width-based calculation
    return W * 0.29; // px from bottom
  } else {
    // Default top-down mode: origin at bottom (0 px from bottom)
    return 0;
  }

  // const halfW = W / 2;
  // const theta = (guideLineAngle * Math.PI) / 180; // angle in radians measured from vertical
  // const tanTheta = Math.tan(theta);

  // // Vertical rise from bottom to the intersection point where the
  // // angled guide (starting at bottom center) reaches the image edge:
  // // y = halfWidth / tan(theta)
  // let y = halfW / tanTheta;

  // // Clamp to image height
  // if (!isFinite(y)) y = 0;
  // if (y < 0) y = 0;
  // if (y > H) y = H;

  // return W * 0.29; //y; // px from bottom
}

// Update transform-origin for a single item element so its pivot is
// placed at the isometric horizon (center horizontally, computed Y)
function updateItemHorizon(item) {
  if (!item || !item.el) return;
  const img = item.el;
  // Only update when image has loaded its dimensions
  if (!img.complete || (img.naturalWidth === 0 && img.naturalHeight === 0))
    return;

  const H = img.naturalHeight;
  const originFromBottom = calculateIsometricHorizon(img, item.isometric);
  const originY = Math.max(0, H - originFromBottom); // px from top
  const originX = (img.naturalWidth || img.width) / 2;

  img.style.transformOrigin = `${originX}px ${originY}px`;
}

function updateAllItemHorizons() {
  items.forEach((item) => updateItemHorizon(item));
}

// Function to update angle and sync both inputs
function updateAngle(newAngle) {
  guideLineAngle = Number(newAngle);
  angleSlider.value = guideLineAngle;
  angleInput.value = guideLineAngle;
  updateAllGuideLineAngles();
  updateGridAngle();
  // Update item horizons because they depend on grid angle
  updateAllItemHorizons();
}

// Function to update grid size and sync both inputs
function updateGridSize(newSize) {
  gridSize = Number(newSize);
  gridSizeSlider.value = gridSize;
  gridSizeInput.value = gridSize;
  updateGridAngle(); // Recreate grid with new size
}

// Angle slider event listener
angleSlider.addEventListener("input", (e) => {
  updateAngle(e.target.value);
});

// Angle text input event listener
angleInput.addEventListener("input", (e) => {
  const value = Number(e.target.value);
  if (!isNaN(value) && value >= 45 && value <= 90) {
    updateAngle(value);
  }
});

// Handle invalid input on blur - reset to current valid value
angleInput.addEventListener("blur", (e) => {
  const value = Number(e.target.value);
  if (isNaN(value) || value < 45 || value > 90) {
    angleInput.value = guideLineAngle;
  }
});

// Grid size slider event listener
gridSizeSlider.addEventListener("input", (e) => {
  updateGridSize(e.target.value);
});

// Grid size text input event listener
gridSizeInput.addEventListener("input", (e) => {
  const value = Number(e.target.value);
  if (!isNaN(value) && value >= 40 && value <= 120) {
    updateGridSize(value);
  }
});

// Handle invalid grid size input on blur - reset to current valid value
gridSizeInput.addEventListener("blur", (e) => {
  const value = Number(e.target.value);
  if (isNaN(value) || value < 40 || value > 120) {
    gridSizeInput.value = gridSize;
  }
});

// Grid checkbox event listener
gridCheckbox.addEventListener("change", toggleGrid);

// Asset Management Functions
let currentReplacingAssetType = null;

// Function to count how many times each asset is used
function getAssetUsageCounts() {
  const usageCounts = {};

  // Count usage in regular items
  items.forEach((item) => {
    usageCounts[item.type] = (usageCounts[item.type] || 0) + 1;
  });

  // Count usage in tiling sprite
  if (tilingSprite && tilingSprite.type) {
    usageCounts[tilingSprite.type] = (usageCounts[tilingSprite.type] || 0) + 1;
  }

  return usageCounts;
}

// Function to highlight all items of a specific asset type
function highlightAssetType(assetType) {
  // Highlight regular items
  items.forEach((item) => {
    if (item.type === assetType) {
      item.el.classList.add("asset-highlighted");
    }
  });

  // Highlight tiling sprite if it matches the type
  if (tilingSprite && tilingSprite.type === assetType) {
    tilingSprite.el.classList.add("asset-highlighted");
  }
}

// Function to remove highlighting from all items
function removeAssetHighlight() {
  // Remove highlight from regular items
  items.forEach((item) => {
    item.el.classList.remove("asset-highlighted");
  });

  // Remove highlight from tiling sprite
  if (tilingSprite) {
    tilingSprite.el.classList.remove("asset-highlighted");
  }
}

// Function to display assets in the panel
function displayAssets() {
  const usageCounts = getAssetUsageCounts();
  assetList.innerHTML = "";

  if (Object.keys(assetsPool).length === 0) {
    assetList.innerHTML =
      '<div class="asset-list-empty">No assets loaded</div>';
    return;
  }

  Object.keys(assetsPool).forEach((assetType) => {
    const assetUrl = assetsPool[assetType];
    const usageCount = usageCounts[assetType] || 0;

    const assetItem = document.createElement("div");
    assetItem.className = "asset-item";

    assetItem.innerHTML = `
      <div class="asset-item-header">
        <div class="asset-thumbnail" style="background-image: url('${assetUrl}')"></div>
        <div class="asset-info">
          <div class="asset-name">${assetType}</div>
          <div class="asset-usage">Used ${usageCount} time${
      usageCount !== 1 ? "s" : ""
    }</div>
        </div>
      </div>
      <div class="asset-actions">
        <button class="asset-replace-btn" onclick="replaceAsset('${assetType}')">
          🔄 Replace Asset
        </button>
      </div>
    `;

    // Add hover event listeners for highlighting
    assetItem.addEventListener("mouseenter", () => {
      highlightAssetType(assetType);
    });

    assetItem.addEventListener("mouseleave", () => {
      removeAssetHighlight();
    });

    assetList.appendChild(assetItem);
  });
}

// Function to open the asset manager panel
function openAssetPanel() {
  assetPanel.classList.add("open");
  displayAssets();
}

// Function to close the asset manager panel
function closeAssetPanelFunc() {
  assetPanel.classList.remove("open");
  // Remove any highlighting when closing the panel
  removeAssetHighlight();
}

// Function to initiate asset replacement
function replaceAsset(assetType) {
  currentReplacingAssetType = assetType;
  replaceAssetInput.click();
}

// Function to replace an asset
function performAssetReplacement(file) {
  if (!currentReplacingAssetType || !file) return;

  // Create object URL for the new asset
  const newObjectURL = URL.createObjectURL(file);
  const oldAssetUrl = assetsPool[currentReplacingAssetType];

  // Update the assets pool
  assetsPool[currentReplacingAssetType] = newObjectURL;

  // Load the new image to get its dimensions
  const tempImg = new Image();
  tempImg.onload = () => {
    const newWidth = tempImg.naturalWidth;
    const newHeight = tempImg.naturalHeight;

    // Update all items using this asset type
    items.forEach((item) => {
      if (item.type === currentReplacingAssetType) {
        // Update the image
        item.el.style.setProperty("--item-image", `url(${newObjectURL})`);

        // Update dimensions
        item.el.style.setProperty("--item-width", newWidth + "px");
        item.el.style.setProperty("--item-height", newHeight + "px");

        // With new positioning system, coordinates are already center-X, bottom-Y
        // so no recalculation needed - just keep the same position
        // (The CSS transform handles the visual positioning)
      }
    });

    // Update tiling sprite if it uses this asset type
    if (tilingSprite && tilingSprite.type === currentReplacingAssetType) {
      tilingSprite.el.style.backgroundImage = `url(${newObjectURL})`;
      tilingSprite.el.style.backgroundSize = `${newWidth}px`;
      tilingSprite.originalSrc = newObjectURL;
    }

    // Refresh the asset display
    displayAssets();

    console.log(
      `Asset ${currentReplacingAssetType} replaced successfully with dimensions ${newWidth}x${newHeight}`
    );

    // Reset the replacing asset type
    currentReplacingAssetType = null;
  };

  tempImg.onerror = () => {
    console.error(
      `Failed to load replacement asset for ${currentReplacingAssetType}`
    );
    // Reset the replacing asset type even on error
    currentReplacingAssetType = null;
  };

  // Start loading the image
  tempImg.src = newObjectURL;

  // Clean up old object URL to prevent memory leaks
  if (oldAssetUrl && oldAssetUrl.startsWith("blob:")) {
    URL.revokeObjectURL(oldAssetUrl);
  }
}

// Event listeners for asset management
assetManagerBtn.addEventListener("click", openAssetPanel);
closeAssetPanel.addEventListener("click", closeAssetPanelFunc);

replaceAssetInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    performAssetReplacement(e.target.files[0]);
    // Clear the input to allow replacing the same asset multiple times
    e.target.value = "";
  }
});

// Close panel when clicking outside of it
document.addEventListener("click", (e) => {
  if (
    assetPanel.classList.contains("open") &&
    !assetPanel.contains(e.target) &&
    !assetManagerBtn.contains(e.target)
  ) {
    closeAssetPanelFunc();
  }
});
