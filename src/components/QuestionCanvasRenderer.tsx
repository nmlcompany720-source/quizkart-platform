import React, { useEffect, useRef } from 'react';

interface QuestionCanvasRendererProps {
  questionNumber: number;
  totalQuestions: number;
  category: string;
  questionText: string;
  options: [string, string, string, string];
  selectedIndex?: number;
  onSelectOption: (idx: number) => void;
  watermarkText?: string;
  securityActive?: boolean;
}

export const QuestionCanvasRenderer: React.FC<QuestionCanvasRendererProps> = ({
  questionNumber,
  totalQuestions,
  category,
  questionText,
  options,
  selectedIndex,
  onSelectOption,
  watermarkText = 'Quizkart',
  securityActive = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // High-DPI Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 2;
    const width = 760;
    const height = 480;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    ctx.scale(dpr, dpr);

    // 1. Crisp Canvas Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // 2. Anti-Screenshot Diagonal Watermark Pattern across canvas strictly 'Quizkart'
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 8);
    ctx.font = '800 16px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(203, 213, 225, 0.35)';
    ctx.textAlign = 'center';
    for (let row = -6; row <= 6; row++) {
      for (let col = -3; col <= 3; col++) {
        ctx.fillText('Quizkart', col * 200, row * 60);
      }
    }
    ctx.restore();

    // 3. Question Category & Number Header Pill
    ctx.fillStyle = '#EEF2FF';
    ctx.beginPath();
    ctx.roundRect(24, 20, 190, 26, 6);
    ctx.fill();
    ctx.strokeStyle = '#C7D2FE';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#4F46E5';
    ctx.textAlign = 'left';
    ctx.fillText(`Q${questionNumber}/${totalQuestions} • ${category.toUpperCase()}`, 34, 37);

    // 4. Secure Encrypted Anti-OCR Badge
    if (securityActive) {
      ctx.fillStyle = '#ECFDF5';
      ctx.beginPath();
      ctx.roundRect(width - 230, 20, 206, 26, 6);
      ctx.fill();
      ctx.strokeStyle = '#A7F3D0';
      ctx.stroke();

      ctx.fillStyle = '#065F46';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('🔒 ENCRYPTED CANVAS STREAM', width - 220, 37);
    }

    // 5. Question Stem / Text Rendering with Word Wrap
    ctx.font = 'bold 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'left';

    const maxTextWidth = width - 48;
    const words = questionText.split(' ');
    let line = '';
    let y = 82;
    const lineHeight = 26;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxTextWidth && n > 0) {
        ctx.fillText(line, 24, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, 24, y);

    // 6. Draw 4 Options Cards on Canvas
    const optionLetters = ['A', 'B', 'C', 'D'];
    const optionYStart = Math.max(y + 28, 175);
    const optionHeight = 56;
    const optionGap = 12;

    options.forEach((optText, i) => {
      const optY = optionYStart + i * (optionHeight + optionGap);
      const isSelected = selectedIndex === i;

      // Card Background
      if (isSelected) {
        ctx.fillStyle = '#EEF2FF';
        ctx.strokeStyle = '#6366F1';
        ctx.lineWidth = 2;
      } else {
        ctx.fillStyle = '#F8FAFC';
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
      }

      ctx.beginPath();
      ctx.roundRect(24, optY, width - 48, optionHeight, 10);
      ctx.fill();
      ctx.stroke();

      // Letter Circle
      ctx.beginPath();
      ctx.arc(52, optY + optionHeight / 2, 14, 0, Math.PI * 2);
      if (isSelected) {
        ctx.fillStyle = '#4F46E5';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#334155';
      }
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(optionLetters[i], 52, optY + optionHeight / 2 + 4);

      // Option Text
      ctx.font = isSelected
        ? 'bold 14px system-ui, -apple-system, sans-serif'
        : '500 14px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = isSelected ? '#1E1B4B' : '#1E293B';
      ctx.textAlign = 'left';

      // Truncate option if too long
      let renderOpt = String(optText || '');
      if (ctx.measureText(renderOpt).width > width - 150) {
        while (ctx.measureText(renderOpt + '...').width > width - 150 && renderOpt.length > 0) {
          renderOpt = renderOpt.slice(0, -1);
        }
        renderOpt += '...';
      }

      ctx.fillText(renderOpt, 80, optY + optionHeight / 2 + 5);

      // Selection Check Circle
      ctx.beginPath();
      ctx.arc(width - 50, optY + optionHeight / 2, 9, 0, Math.PI * 2);
      if (isSelected) {
        ctx.fillStyle = '#4F46E5';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(width - 50, optY + optionHeight / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

  }, [questionNumber, totalQuestions, category, questionText, options, selectedIndex, watermarkText, securityActive]);

  // Click on Canvas handles option selection by coordinate mapping
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleY = 480 / rect.height;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Determine yStart
    const optionYStart = 175;
    const optionHeight = 56;
    const optionGap = 12;

    for (let i = 0; i < 4; i++) {
      const top = optionYStart + i * (optionHeight + optionGap);
      const bottom = top + optionHeight;
      if (clickY >= top && clickY <= bottom) {
        onSelectOption(i);
        break;
      }
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-300 shadow-sm bg-white select-none">
      {/* Canvas Layer */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-auto cursor-pointer block select-none pointer-events-auto"
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none'
        }}
      />
    </div>
  );
};
