import { removeToken } from "../../utils/Auth";

const Dashboard = ({ onSuccess }) => {
  const handleLogout = () => {
    removeToken();
    onSuccess();
  };
  return (
    <div className="container py-3">
      <h2 className="text-center">Chào mừng bạn đã quay trở lại</h2>
      <button className="btn btn-danger d-block mx-auto" onClick={handleLogout}>
        Đăng Xuất
      </button>
    </div>
  );
};

export default Dashboard;
