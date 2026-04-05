function ColorPicker({ selectedColor, setSelectedColor }) {
  return (
    <div className="color-picker-section">
      <h3>Choose a Color</h3>
      <input
        type="color"
        value={selectedColor}
        onChange={(e) => setSelectedColor(e.target.value)}
      />
    </div>
  );
}

export default ColorPicker;