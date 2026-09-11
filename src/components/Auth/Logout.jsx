import { removeToken } from "../../utils/auth";

const Logout = ({ children, onSuccess }) => {
  const handleLogout = () => {
    removeToken();
    onSuccess();
  };
  return <div onClick={handleLogout}>{children}</div>;
};

export default Logout;
