import Logout from "../Auth/Logout";
import Profile from "./Profile";

const Dashboard = ({ onSuccess }) => {
  return (
    <div className="container py-3">
      <h2 className="text-center">Chào mừng bạn đã quay trở lại</h2>
      <Profile onSuccess={onSuccess}></Profile>
      <Logout onSuccess={onSuccess}>
        <button className="btn btn-danger d-block mx-auto">Đăng Xuất</button>
      </Logout>
    </div>
  );
};

export default Dashboard;
