import "./Productpage.css";
import { useState } from "react";
import Shirtviewer from "../Components/Shirtviewer";
import ColorPicker from "../Components/ColorPicker";
import UploadDesign from "../Components/UploadDesign";

function Productpage() {
  const [selectedShirt, setSelectedShirt] = useState("/halfsleeve.glb");
  const [selectedColor, setSelectedColor] = useState("#ffffff");
  const [designUrl, setDesignUrl] = useState(null);
  const [designX, setDesignX] = useState(0);
  const [designY, setDesignY] = useState(0.2);
  const [designScale, setDesignScale] = useState(0.8);
  const [designRotation, setDesignRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
const [designPosition, setDesignPosition] = useState([0, 0.2, 0.6]);
 
  return (
    <div className="product-page">
      <div className="product-container">
        <p>Select a shirt style, upload your design, and choose a color.</p>

        <div className="shirt-options">
          <div
            className="shirt-card"
            onClick={() => setSelectedShirt("/fullsleeve.glb")}
          >
            <div className="shirt-image"></div>
            <p>Full Sleeve</p>
          </div>

          <div
            className="shirt-card"
            onClick={() => setSelectedShirt("/halfsleeve.glb")}
          >
            <div className="shirt-image"></div>
            <p>Half Sleeve</p>
          </div>
        </div>

        <ColorPicker
          selectedColor={selectedColor}
          setSelectedColor={setSelectedColor}
        />

        <UploadDesign
          setDesignUrl={setDesignUrl}
          designX={designX}
          setDesignX={setDesignX}
          designY={designY}
          setDesignY={setDesignY}
          designScale={designScale}
          setDesignScale={setDesignScale}
          designRotation={designRotation}
          setDesignRotation={setDesignRotation}
        />

        <Shirtviewer
          modelPath={selectedShirt}
          color={selectedColor}
          designUrl={designUrl}
          designPosition={designPosition}
          designScale={designScale}
          designRotation={designRotation}
  setDesignPosition={setDesignPosition}
  dragging={dragging}
  setDragging={setDragging}
/>
      
      </div>
    </div>
  );
}

export default Productpage;