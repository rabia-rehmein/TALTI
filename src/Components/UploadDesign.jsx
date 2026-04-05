function UploadDesign({
  setDesignUrl,
  designX,
  setDesignX,
  designY,
  setDesignY,
  designScale,
  setDesignScale,
  designRotation,
  setDesignRotation,
}) {
  const handleDesignUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    setDesignUrl(imageUrl);
  };

  return (
    <div className="upload-section">
      <h3>Upload Your Design</h3>
      <input type="file" accept="image/*" onChange={handleDesignUpload} />

      <div className="design-controls">
        <label>
          Move Left / Right
          <input
            type="range"
            min="-0.5"
            max="0.5"
            step="0.01"
            value={designX}
            onChange={(e) => setDesignX(Number(e.target.value))}
          />
        </label>

        <label>
          Move Up / Down
          <input
            type="range"
            min="-0.5"
            max="0.5"
            step="0.01"
            value={designY}
            onChange={(e) => setDesignY(Number(e.target.value))}
          />
        </label>

        <label>
          Resize
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.01"
            value={designScale}
            onChange={(e) => setDesignScale(Number(e.target.value))}
          />
        </label>

        <label>
          Rotate
          <input
            type="range"
            min="-3.14"
            max="3.14"
            step="0.01"
            value={designRotation}
            onChange={(e) => setDesignRotation(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}

export default UploadDesign;