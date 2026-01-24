import { useState, useRef, useEffect } from 'react';
import { X, Save } from 'lucide-react';

/**
 * ThumbnailZoneEditor Component
 * Interactive editor for defining product placement zones on thumbnail templates
 * 
 * Features:
 * - Click and drag to draw rectangle
 * - Resize by dragging corners
 * - Move by dragging center
 * - Real-time dimension display
 * - Saves zone as percentages (0-100)
 */
export default function ThumbnailZoneEditor({ 
  templateImage, 
  initialZone = null,
  onSave, 
  onCancel 
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [zone, setZone] = useState(initialZone || { x: 20, y: 20, width: 40, height: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  // Load and draw the template image
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Calculate display size while maintaining aspect ratio
      const containerWidth = container.clientWidth;
      const aspectRatio = img.height / img.width;
      const displayWidth = Math.min(containerWidth, 800);
      const displayHeight = displayWidth * aspectRatio;

      canvas.width = displayWidth;
      canvas.height = displayHeight;

      setImageDimensions({ width: displayWidth, height: displayHeight });
      
      drawCanvas(ctx, img, displayWidth, displayHeight);
    };

    img.src = templateImage;
  }, [templateImage]);

  // Redraw canvas when zone changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || imageDimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      drawCanvas(ctx, img, imageDimensions.width, imageDimensions.height);
    };

    img.src = templateImage;
  }, [zone, templateImage, imageDimensions]);

  const drawCanvas = (ctx, img, width, height) => {
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw template image
    ctx.drawImage(img, 0, 0, width, height);

    // Draw zone overlay
    const zonePixels = {
      x: (zone.x / 100) * width,
      y: (zone.y / 100) * height,
      width: (zone.width / 100) * width,
      height: (zone.height / 100) * height
    };

    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(249, 115, 22, 0.3)'; // Orange overlay
    ctx.fillRect(zonePixels.x, zonePixels.y, zonePixels.width, zonePixels.height);

    // Border
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.strokeRect(zonePixels.x, zonePixels.y, zonePixels.width, zonePixels.height);

    // Corner handles (for resizing)
    const handleSize = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;

    // Top-left
    ctx.fillRect(zonePixels.x - handleSize/2, zonePixels.y - handleSize/2, handleSize, handleSize);
    ctx.strokeRect(zonePixels.x - handleSize/2, zonePixels.y - handleSize/2, handleSize, handleSize);

    // Top-right
    ctx.fillRect(zonePixels.x + zonePixels.width - handleSize/2, zonePixels.y - handleSize/2, handleSize, handleSize);
    ctx.strokeRect(zonePixels.x + zonePixels.width - handleSize/2, zonePixels.y - handleSize/2, handleSize, handleSize);

    // Bottom-left
    ctx.fillRect(zonePixels.x - handleSize/2, zonePixels.y + zonePixels.height - handleSize/2, handleSize, handleSize);
    ctx.strokeRect(zonePixels.x - handleSize/2, zonePixels.y + zonePixels.height - handleSize/2, handleSize, handleSize);

    // Bottom-right
    ctx.fillRect(zonePixels.x + zonePixels.width - handleSize/2, zonePixels.y + zonePixels.height - handleSize/2, handleSize, handleSize);
    ctx.strokeRect(zonePixels.x + zonePixels.width - handleSize/2, zonePixels.y + zonePixels.height - handleSize/2, handleSize, handleSize);

    // Label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText('Product Zone', zonePixels.x + 5, zonePixels.y + 20);
  };

  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const getResizeHandle = (mouseX, mouseY) => {
    const handleSize = 10;
    const zonePixels = {
      x: (zone.x / 100) * imageDimensions.width,
      y: (zone.y / 100) * imageDimensions.height,
      width: (zone.width / 100) * imageDimensions.width,
      height: (zone.height / 100) * imageDimensions.height
    };

    const handles = {
      'tl': { x: zonePixels.x, y: zonePixels.y },
      'tr': { x: zonePixels.x + zonePixels.width, y: zonePixels.y },
      'bl': { x: zonePixels.x, y: zonePixels.y + zonePixels.height },
      'br': { x: zonePixels.x + zonePixels.width, y: zonePixels.y + zonePixels.height }
    };

    for (const [key, pos] of Object.entries(handles)) {
      if (
        mouseX >= pos.x - handleSize &&
        mouseX <= pos.x + handleSize &&
        mouseY >= pos.y - handleSize &&
        mouseY <= pos.y + handleSize
      ) {
        return key;
      }
    }

    return null;
  };

  const isInsideZone = (mouseX, mouseY) => {
    const zonePixels = {
      x: (zone.x / 100) * imageDimensions.width,
      y: (zone.y / 100) * imageDimensions.height,
      width: (zone.width / 100) * imageDimensions.width,
      height: (zone.height / 100) * imageDimensions.height
    };

    return (
      mouseX >= zonePixels.x &&
      mouseX <= zonePixels.x + zonePixels.width &&
      mouseY >= zonePixels.y &&
      mouseY <= zonePixels.y + zonePixels.height
    );
  };

  const handleMouseDown = (e) => {
    const pos = getMousePos(e);
    const handle = getResizeHandle(pos.x, pos.y);

    if (handle) {
      setIsResizing(true);
      setResizeHandle(handle);
      setDragStart(pos);
    } else if (isInsideZone(pos.x, pos.y)) {
      setIsDragging(true);
      setDragStart(pos);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging && !isResizing) {
      // Update cursor based on hover
      const pos = getMousePos(e);
      const handle = getResizeHandle(pos.x, pos.y);
      const canvas = canvasRef.current;

      if (handle) {
        if (handle === 'tl' || handle === 'br') {
          canvas.style.cursor = 'nwse-resize';
        } else {
          canvas.style.cursor = 'nesw-resize';
        }
      } else if (isInsideZone(pos.x, pos.y)) {
        canvas.style.cursor = 'move';
      } else {
        canvas.style.cursor = 'crosshair';
      }
      return;
    }

    const pos = getMousePos(e);
    const deltaX = pos.x - dragStart.x;
    const deltaY = pos.y - dragStart.y;

    if (isResizing) {
      handleResize(deltaX, deltaY);
    } else if (isDragging) {
      handleDrag(deltaX, deltaY);
    }

    setDragStart(pos);
  };

  const handleResize = (deltaX, deltaY) => {
    const deltaXPercent = (deltaX / imageDimensions.width) * 100;
    const deltaYPercent = (deltaY / imageDimensions.height) * 100;

    let newZone = { ...zone };

    switch (resizeHandle) {
      case 'tl':
        newZone.x += deltaXPercent;
        newZone.y += deltaYPercent;
        newZone.width -= deltaXPercent;
        newZone.height -= deltaYPercent;
        break;
      case 'tr':
        newZone.y += deltaYPercent;
        newZone.width += deltaXPercent;
        newZone.height -= deltaYPercent;
        break;
      case 'bl':
        newZone.x += deltaXPercent;
        newZone.width -= deltaXPercent;
        newZone.height += deltaYPercent;
        break;
      case 'br':
        newZone.width += deltaXPercent;
        newZone.height += deltaYPercent;
        break;
    }

    // Ensure zone stays within bounds and has minimum size
    newZone.x = Math.max(0, Math.min(95, newZone.x));
    newZone.y = Math.max(0, Math.min(95, newZone.y));
    newZone.width = Math.max(5, Math.min(100 - newZone.x, newZone.width));
    newZone.height = Math.max(5, Math.min(100 - newZone.y, newZone.height));

    setZone(newZone);
  };

  const handleDrag = (deltaX, deltaY) => {
    const deltaXPercent = (deltaX / imageDimensions.width) * 100;
    const deltaYPercent = (deltaY / imageDimensions.height) * 100;

    let newZone = { ...zone };
    newZone.x += deltaXPercent;
    newZone.y += deltaYPercent;

    // Ensure zone stays within bounds
    newZone.x = Math.max(0, Math.min(100 - zone.width, newZone.x));
    newZone.y = Math.max(0, Math.min(100 - zone.height, newZone.y));

    setZone(newZone);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
  };

  const handleSave = () => {
    // Round to 1 decimal place for cleaner values
    const roundedZone = {
      x: Math.round(zone.x * 10) / 10,
      y: Math.round(zone.y * 10) / 10,
      width: Math.round(zone.width * 10) / 10,
      height: Math.round(zone.height * 10) / 10
    };
    onSave(roundedZone);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-theme-surface rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-theme">
          <h2 className="text-xl font-semibold text-theme-primary">
            Define Product Placement Zone
          </h2>
          <button
            onClick={onCancel}
            className="text-theme-tertiary hover:text-theme-primary transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Canvas Area */}
        <div className="p-6 overflow-auto max-h-[calc(90vh-200px)]">
          <div ref={containerRef} className="w-full">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="border border-theme rounded-lg w-full cursor-crosshair"
            />
          </div>

          {/* Instructions */}
          <div className="mt-4 p-4 bg-theme-primary rounded-lg">
            <p className="text-sm text-theme-secondary">
              <strong>Instructions:</strong> Drag the corners to resize the zone, or drag the center to move it.
              The product image will be placed within this zone.
            </p>
          </div>

          {/* Zone Dimensions */}
          <div className="mt-4 grid grid-cols-4 gap-4">
            <div className="bg-theme-primary p-3 rounded-lg">
              <div className="text-xs text-theme-tertiary">X Position</div>
              <div className="text-lg font-semibold text-theme-primary">
                {zone.x.toFixed(1)}%
              </div>
            </div>
            <div className="bg-theme-primary p-3 rounded-lg">
              <div className="text-xs text-theme-tertiary">Y Position</div>
              <div className="text-lg font-semibold text-theme-primary">
                {zone.y.toFixed(1)}%
              </div>
            </div>
            <div className="bg-theme-primary p-3 rounded-lg">
              <div className="text-xs text-theme-tertiary">Width</div>
              <div className="text-lg font-semibold text-theme-primary">
                {zone.width.toFixed(1)}%
              </div>
            </div>
            <div className="bg-theme-primary p-3 rounded-lg">
              <div className="text-xs text-theme-tertiary">Height</div>
              <div className="text-lg font-semibold text-theme-primary">
                {zone.height.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-theme">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save size={18} />
            Save Template
          </button>
        </div>
      </div>
    </div>
  );
}
