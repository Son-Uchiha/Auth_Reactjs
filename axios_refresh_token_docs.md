# Hướng Dẫn Cấu Hình Axios Tự Động Refresh Token

Tài liệu này giải thích chi tiết cách cấu hình Axios Interceptor để tự động gắn Access Token vào mỗi request, và tự động gọi API Refresh Token khi Access Token hết hạn (lỗi 401). Đặc biệt, cấu hình này tích hợp **cơ chế Hàng Đợi (Queue)** để xử lý mượt mà trường hợp có nhiều request cùng gửi đi lúc token vừa hết hạn.

---

## 1. Tại sao cần cơ chế Hàng Đợi (Queue)?
Khi Access Token hết hạn, nếu trang web của bạn gọi đồng thời 3 APIs, cả 3 sẽ đều trả về lỗi 401. 
Nếu không có hàng đợi:
- Cả 3 request đều nhận lỗi 401.
- Cả 3 đều cố gắng gọi API Refresh Token cùng một lúc.
- Dẫn đến việc lãng phí tài nguyên, hoặc server từ chối vì gửi quá nhiều request refresh.

**Giải pháp:**
- Dùng cờ `isRefreshing` để biết đang có tiến trình refresh token hay không.
- Khi request đầu tiên bị lỗi 401, nó sẽ đi gọi API Refresh Token. `isRefreshing` bật thành `true`.
- Các request bị lỗi 401 tiếp theo sẽ bị tạm giữ lại và đưa vào mảng `failedQueue`.
- Sau khi refresh token thành công, lặp qua `failedQueue` để tiếp tục gửi lại các request đang chờ với token mới.

---

## 2. Giải thích chi tiết mã nguồn

### Bước 1: Khởi tạo Axios Instance và các biến phụ trợ

```javascript
import axios from "axios";

// Khởi tạo instance với Base URL lấy từ Vite env
const instance = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Biến cờ: Đánh dấu xem có đang trong quá trình gọi API refresh token hay không
let isRefreshing = false;

// Hàng đợi: Lưu trữ các request bị lỗi 401 trong lúc đang chờ refresh token
let failedQueue = [];

// Hàm xử lý hàng đợi: Sẽ được gọi sau khi refresh token xong (thành công hoặc thất bại)
const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error); // Nếu refresh thất bại, hủy toàn bộ request đang chờ
    } else {
      prom.resolve(token); // Nếu refresh thành công, cho phép các request tiếp tục chạy
    }
  });
  failedQueue = []; // Làm rỗng hàng đợi
};
```

### Bước 2: Request Interceptor - Gắn Token

Đoạn code này can thiệp vào trước lúc request được gửi lên server.

```javascript
instance.interceptors.request.use(
  function (config) {
    // Lấy token từ Local Storage
    const token = localStorage.getItem("access_token");
    
    // Nếu có token, tự động đính kèm vào header Authorization
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  function (error) {
    return Promise.reject(error);
  }
);
```

### Bước 3: Response Interceptor - Xử lý dữ liệu và Refresh Token

Đoạn code này can thiệp vào sau khi server trả kết quả về (thành công hoặc báo lỗi).

```javascript
instance.interceptors.response.use(
  function (response) {
    // Tùy chỉnh dữ liệu trả về cho gọn nhẹ.
    // Nếu API của bạn bọc dữ liệu trong field `data` thì ta lấy luôn `response.data.data`
    if (response.data && response.data.data) return response.data;
    return response;
  },
  async function (error) {
    const originalRequest = error.config; // Lưu lại thông tin cấu hình của request bị lỗi

    // Nếu lỗi là 401 (Hết hạn Token) và request này chưa từng được retry (thử lại)
    if (error.response?.status === 401 && !originalRequest._retry) {
        
      // -------------------------------------------------------------
      // TRƯỜNG HỢP 1: ĐANG CÓ 1 REQUEST KHÁC ĐI REFRESH TOKEN RỒI
      // -------------------------------------------------------------
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          // Bỏ request này vào hàng đợi để chờ
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            // Khi được hàm processQueue gọi `resolve(token)`, code sẽ chạy vào đây
            // Cập nhật lại token mới và gửi lại request
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return instance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      // -------------------------------------------------------------
      // TRƯỜNG HỢP 2: ĐÂY LÀ REQUEST ĐẦU TIÊN PHÁT HIỆN LỖI 401
      // -------------------------------------------------------------
      
      originalRequest._retry = true; // Đánh dấu request này đã được tiến hành thử lại
      isRefreshing = true;           // Bật cờ khóa, các request lỗi sau sẽ phải vào queue

      try {
        const refreshToken = localStorage.getItem("refresh_token");

        // GỌI API REFRESH TOKEN (Lưu ý: Dùng `axios` gốc, không dùng `instance` để tránh bị vòng lặp vô tận)
        const res = await axios.post(
          `${import.meta.env.VITE_BACKEND_URL}/auth/refresh`,
          { refreshToken }
        );

        // Lấy token mới từ response
        const newAccessToken = res.data?.data?.access_token || res.data?.access_token;
        localStorage.setItem("access_token", newAccessToken);

        // Báo cho các request trong hàng đợi biết là đã có token mới
        processQueue(null, newAccessToken);

        // Gắn token mới vào request hiện tại và thực thi lại nó
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return instance(originalRequest);
        
      } catch (refreshError) {
        // Refresh token thất bại (Ví dụ: refresh_token cũng đã hết hạn)
        processQueue(refreshError, null); // Báo lỗi cho toàn bộ request đang chờ
        
        // Xóa thông tin đăng nhập và đẩy user về trang login
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
        
        return Promise.reject(refreshError);
      } finally {
        // Hoàn tất quá trình refresh, mở khóa cờ
        isRefreshing = false;
      }
    }

    // Xử lý các lỗi khác ngoài 401
    if (error.response && error.response.data) return Promise.reject(error.response.data);
    return Promise.reject(error);
  }
);

export default instance;
```

---

## 3. Các điểm lưu ý quan trọng khi áp dụng

1. **API Endpoint Refresh Token:** 
   Trong code mẫu, đường dẫn gọi API refresh là `/auth/refresh`. Bạn cần thay đổi lại cho khớp với thiết kế API backend thực tế của bạn.
2. **Cấu trúc Response:**
   Đoạn code đang lấy token bằng `res.data?.data?.access_token || res.data?.access_token`. Hãy `console.log(res)` để đảm bảo bạn đang chọc đúng vào vị trí của access_token được trả về.
3. **Tránh vòng lặp vô tận (Infinite Loop):**
   Tuyệt đối **phải dùng `axios.post`** thay vì `instance.post` khi gọi API Refresh Token. Nếu dùng `instance.post`, request refresh token cũng sẽ chạy qua interceptor, nếu báo lỗi 401 nó lại tiếp tục đi refresh, tạo thành vòng lặp vô tận làm treo trình duyệt.

---

## 4. Hướng dẫn sử dụng trong dự án thực tế (Production)

Sau khi đã cấu hình xong file `api.service.js` (hoặc `axios.customize.js`), bạn **không sử dụng `axios` mặc định nữa**, mà sẽ import `instance` vừa tạo để gọi API ở mọi nơi trong dự án.

### 4.1. Tổ chức thư mục API (Best Practice)
Thay vì gọi API trực tiếp trong component React, bạn nên tách ra các file service riêng để dễ quản lý. Ví dụ: tạo file `src/services/userService.js`.

```javascript
// src/services/userService.js
import axiosInstance from "./api.service"; // Import instance đã cấu hình

// Hàm lấy danh sách user
const fetchAllUser = (page, limit) => {
    return axiosInstance.get(`/api/v1/user?page=${page}&limit=${limit}`);
};

// Hàm tạo mới user
const createUser = (data) => {
    return axiosInstance.post(`/api/v1/user`, data);
};

export { fetchAllUser, createUser };
```

### 4.2. Gọi API trong React Component
Trong các component React (như `UserTable.jsx`, `ViewUserDetail.jsx`), bạn chỉ cần gọi các hàm từ service đã định nghĩa. Tất cả việc gắn token hay xử lý refresh token sẽ tự động chạy ngầm mà component không cần quan tâm.

```javascript
// src/component/user/UserTable.jsx
import { useEffect, useState } from "react";
import { fetchAllUser } from "../../services/userService";

const UserTable = () => {
    const [dataUser, setDataUser] = useState([]);

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            // Không cần lo về headers hay token ở đây nữa!
            const res = await fetchAllUser(1, 10);
            
            // Do trong Interceptor ta đã cấu hình return response.data.data (nếu có),
            // hoặc return response.data, nên kết quả trả về thường đã gọn gàng.
            if (res) {
                setDataUser(res); // Hoặc res.users tùy theo API của bạn
            }
        } catch (error) {
            console.error("Lỗi khi tải danh sách user:", error);
            // Có thể dùng thư viện như toastify để báo lỗi cho user
        }
    };

    return (
        <div>
            {/* Render dữ liệu của bạn... */}
        </div>
    );
};

export default UserTable;
```

### 4.3. Tối ưu cho Production
- **Biến môi trường:** Đảm bảo khi build (`npm build`), file `.env.production` chứa đúng đường dẫn backend thực tế (VD: `VITE_BACKEND_URL=https://api.production.com`).
- **Xử lý đăng xuất (Logout):** Nếu refresh token thất bại, code đã có đoạn `window.location.href = "/login"`. Để tối ưu trong React (tránh reload lại trang gây mất state), bạn có thể dùng một custom event hoặc state management (như Redux, Zustand, Context) để trigger việc redirect qua React Router (ví dụ dùng `navigate("/login")`), nhưng `window.location.href` vẫn là một cách an toàn và dứt khoát.

---

## 5. Ví dụ: Hàm Login và cách lưu Token vào LocalStorage (Best Practice)

**Lời khuyên:** Bạn **NÊN TÁCH RIÊNG** `access_token` và `refresh_token` thành 2 key độc lập trong `localStorage` thay vì gom chung vào một object (ví dụ gộp thành chuỗi JSON lưu trong key `authToken`).

**Lý do:** 
- Interceptor chạy liên tục trên mọi request để lấy token đính kèm vào header. Việc lưu tách biệt giúp lệnh `localStorage.getItem("access_token")` chạy mượt mà trực tiếp mà không tốn chi phí gọi hàm `JSON.parse` liên tục.
- Khi refresh token thành công, bạn chỉ cần thay thế đúng giá trị của `access_token` bằng lệnh `setItem` một cách rất gọn gàng.

### 5.1. Định nghĩa API Đăng Nhập
Tạo một file service riêng để chứa các API liên quan đến xác thực (Auth).

```javascript
// src/services/authService.js
import axiosInstance from "./api.service";

// Hàm gọi API Đăng Nhập
const loginAPI = (email, password) => {
    // Đảm bảo cấu trúc payload JSON gửi đi khớp với API Backend yêu cầu
    return axiosInstance.post(`/api/v1/auth/login`, {
        email: email,
        password: password
    });
};

export { loginAPI };
```

### 5.2. Hàm xử lý logic Login và lưu Storage (trong React Component)

Dưới đây là một ví dụ mẫu cho trang Đăng Nhập, mô phỏng quá trình bấm nút Submit:

```javascript
// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginAPI } from "../services/authService";

const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();

        try {
            // 1. Gọi hàm gọi API từ file service
            const res = await loginAPI(email, password);

            // 2. Giả sử API trả về data chứa token trực tiếp bên trong biến `res`
            // (Vì ở Response Interceptor, ta đã trích xuất `return response.data.data` hoặc `response.data`)
            if (res && res.access_token) {
                
                // LƯU TÁCH RIÊNG TỪNG KEY VÀO LOCAL STORAGE
                localStorage.setItem("access_token", res.access_token);
                localStorage.setItem("refresh_token", res.refresh_token);

                // (Tùy chọn) Lưu thêm thông tin người dùng nếu API có trả về
                if (res.user) {
                    localStorage.setItem("user", JSON.stringify(res.user));
                }

                console.log("Đăng nhập thành công!");
                
                // 3. Điều hướng người dùng về trang chủ (hoặc Dashboard)
                navigate("/");
            }
        } catch (error) {
            console.error("Lỗi đăng nhập:", error);
            // Có thể hiển thị toast báo lỗi sai mật khẩu ở đây
            alert("Sai tài khoản hoặc mật khẩu!");
        }
    };

    return (
        <form onSubmit={handleLogin}>
            <input 
               type="email" 
               placeholder="Nhập email..." 
               value={email} 
               onChange={(e) => setEmail(e.target.value)} 
            />
            <input 
               type="password" 
               placeholder="Nhập mật khẩu..." 
               value={password} 
               onChange={(e) => setPassword(e.target.value)} 
            />
            <button type="submit">Đăng Nhập</button>
        </form>
    );
};

export default Login;
```
