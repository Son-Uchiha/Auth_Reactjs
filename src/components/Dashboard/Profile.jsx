import { useEffect, useState } from "react";
import { getUser, logout } from "../../utils/auth";
import Logout from "../Auth/Logout";

const Profile = ({ onSuccess }) => {
  const [user, setUser] = useState({});
  const [isLoading, setLoading] = useState(true);
  useEffect(() => {
    const getProfile = async () => {
      const user = await getUser();
      if (user) {
        setUser(user);
        setLoading(false);
      } else {
        logout();
        onSuccess();
      }
    };

    getProfile();
  }, []);

  return (
    <div className="mx-auto w-50">
      <ul className="d-flex list-unstyled justify-content-center gap-2">
        <li>Chào: {isLoading ? "Loading..." : user.name}</li>
        <li>
          <a href="#">Tài khoản</a>
        </li>
        <li>
          <Logout onSuccess={onSuccess}>
            <a href="#">Đăng xuất</a>
          </Logout>
        </li>
      </ul>
    </div>
  );
};

export default Profile;
