import "bootstrap/dist/css/bootstrap.min.css";
import Login from "./components/Auth/Login";
import { getToken } from "./utils/auth";
import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard/Dashboard";

const App = () => {
  const [isAuthenticate, setAuthenticate] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken();
      if (token) {
        setAuthenticate(true);
      }
    };
    checkAuth();
  }, []);
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
