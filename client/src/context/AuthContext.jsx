import { useState, useEffect } from 'react';
import { api } from '../api';
import { AuthContext } from './authContextCore';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('token')));

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return undefined;
    let cancelled = false;
    api.me()
      .then(data => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username, password) => {
    const data = await api.login(username, password);
    localStorage.setItem('token', data.token);
    const me = await api.me();
    setUser(me);
    return me;
  };

  const loginAdmin = async (username, password) => {
    const data = await api.adminLogin(username, password);
    localStorage.setItem('token', data.token);
    const me = await api.me();
    setUser(me);
    return me;
  };

  const register = async (payload) => {
    const data = await api.register(payload);
    localStorage.setItem('token', data.token);
    const me = await api.me();
    setUser(me);
    return me;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const refreshUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const me = await api.me();
    setUser(me);
    return me;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAdmin, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
