import "bootstrap/dist/css/bootstrap.min.css";
import Login from "./components/Auth/Login";
import { getToken } from "./utils/Auth";
import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard/Dashboard";

const App = () => {
  const [isAuthenticate, setAuthenticate] = useState(false);
  const checkAuth = () => {
    const token = getToken();
    if (token) {
      setAuthenticate(true);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);
  console.log(isAuthenticate);
  return (
    <div>
      {isAuthenticate ? (
        <Dashboard onSuccess={() => setAuthenticate(false)}></Dashboard>
      ) : (
        <Login onLogin={() => setAuthenticate(true)} />
      )}
    </div>
  );
};

export default App;
