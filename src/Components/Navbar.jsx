import { Link } from "react-router-dom";
import "./Navbar.css";
function Navbar() {
  return (
    <div className="navbar">
      <strong>TALTI</strong>

      <div className="nav-links">
        <Link to="/">Home</Link>
        <Link to="/shop">Shop</Link>
        <Link to="/upload">Upload</Link>
        <Link to="/signin">Sign in</Link>
      </div>
    </div>
  );
}

export default Navbar;