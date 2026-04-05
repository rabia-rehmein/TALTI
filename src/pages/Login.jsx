import "./Login.css";

function Login() {
  return (
    <div className="login-page">

      <div className="login-container">
        <h1>Sign In</h1>
        <p>Welcome back to TALTI</p>

        <form className="login-form">
          <input type="email" placeholder="Email" required />
          <input type="password" placeholder="Password" required />

          <button type="submit">Login</button>
        </form>
      </div>

    </div>
  );
}

export default Login;