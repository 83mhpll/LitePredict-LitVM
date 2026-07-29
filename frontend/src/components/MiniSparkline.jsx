export const MiniSparkline = ({ points = [40, 50, 45, 60, 55, 70, 65, 80], color = '#00d4ff' }) => {
  const width = 180;
  const height = 50;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (width - 10) + 5;
    const y = height - ((p - min) / range) * (height - 10) - 5;
    return `${x},${y}`;
  });
  const pathD = `M ${coords.join(' L ')}`;
  const fillD = `M 5,${height} L ${coords.join(' L ')} L ${width - 5},${height} Z`;
  const gradId = `grad-${color.replace('#','')}`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible', margin: '8px 0' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length-1].split(',')[0]} cy={coords[coords.length-1].split(',')[1]} r="3.5" fill={color} />
    </svg>
  );
};
