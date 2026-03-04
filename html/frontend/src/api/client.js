import axios from 'axios';

// Production: http://95.142.44.243:8000/api/v1
// Development: http://localhost:8000/api/v1
// Use relative path for dev to allow Vite proxy to handle requests from other devices
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const loggingAPI = {
  logFrontendError: (message, context = null, details = null) =>
    apiClient
      .post('/logs/frontend', { message, context, details })
      .catch(() => {}),
};

// Add token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // If 401, redirect to login UNLESS it's the history or trash endpoint (temporary fix for debugging/stability)
    // Sometimes history/trash endpoint might return 401 due to strict permissions, but we don't want to logout the user completely
    const url = error.config?.url || '';
    const isHistoryEndpoint = url.includes('/history') || url.includes('/trash');
    const isAuthMeEndpoint = url.includes('/auth/me');

    if (error.response?.status === 401 && !isHistoryEndpoint) {
      try {
        sessionStorage.setItem('auth_notice', 'Сессия истекла. Пожалуйста, войдите снова.');
      } catch (e) { void e; }

      // Всегда выкидываем на логин при 401 (кроме исключений), так как это означает невалидный токен
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const uploadAPI = {
  uploadMedia: async (formData) => {
    const response = await apiClient.post('/media', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  uploadMedicalDoc: async (formData) => {
    const response = await apiClient.post('/medical-docs', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
};

// Auth API
export const authAPI = {
  login: (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    return apiClient.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  },
  register: (data) => apiClient.post('/auth/register', data),
  getMe: () => apiClient.get('/auth/me'),
  changePassword: (current, newPass) => apiClient.put('/auth/me/password', { current_password: current, new_password: newPass }),
  getMyPassword: () => apiClient.get('/auth/me/password'),
  changeLanguage: (language) => apiClient.put('/auth/me/language', { language }),
  uploadAvatar: (formData) => apiClient.post('/auth/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteAvatar: () => apiClient.delete('/users/avatar'),
  getUsers: (params) => apiClient.get('/auth/users', { params }),
};

// Users API
export const usersAPI = {
  getAll: (params) => apiClient.get('/auth/users', { params }),
  getById: (id) => apiClient.get(`/auth/users/${id}`),
  getByRole: (role) => apiClient.get(`/auth/users?role=${role}`),
  create: (data) => apiClient.post('/auth/users', data),
  update: (id, data) => apiClient.put(`/auth/users/${id}`, data),
  delete: (id) => apiClient.delete(`/auth/users/${id}`),
  getArchived: () => apiClient.get('/auth/users/archived'),
  restore: (id) => apiClient.post(`/auth/users/${id}/restore`),
  getCredentials: (role) => apiClient.get(`/auth/credentials${role ? `?role=${role}` : ''}`),
  getUserPassword: (userId) => apiClient.get(`/auth/credentials/${userId}`),
  uploadAvatar: (userId, formData) => apiClient.post(`/auth/users/${userId}/avatar`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAvatar: (userId) => apiClient.delete(`/auth/users/${userId}/avatar`),
};

// Students API
export const studentsAPI = {
  getAll: (params) => {
    if (typeof params === 'number') return apiClient.get(`/students/?limit=${params}`);
    return apiClient.get('/students/', { params });
  },
  getById: (id) => apiClient.get(`/students/${id}`),
  create: (data) => apiClient.post('/students/', data),
  update: (id, data) => apiClient.put(`/students/${id}`, data),
  delete: (id) => apiClient.delete(`/students/${id}`),
  getArchived: () => apiClient.get('/students/archived'),
  restore: (id) => apiClient.post(`/students/${id}/restore`),
  uploadAvatar: (id, formData) => apiClient.post(`/students/${id}/avatar`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAvatar: (id) => apiClient.delete(`/students/${id}/avatar`),
  requestFreeze: (studentId, data) => apiClient.post(`/students/${studentId}/freeze-request`, data),
  getFreezeRequest: (studentId) => apiClient.get(`/students/${studentId}/freeze-request`),
  approveFreeze: (studentId, requestId) => apiClient.post(`/students/${studentId}/approve-freeze/${requestId}`),
  rejectFreeze: (studentId, requestId) => apiClient.post(`/students/${studentId}/reject-freeze/${requestId}`),
  deleteFreezeRequest: (studentId, requestId) => apiClient.delete(`/students/${studentId}/freeze-request/${requestId}`),
  unfreeze: (studentId) => apiClient.post(`/students/${studentId}/unfreeze`),
  getHistory: (id) => apiClient.get(`/students/${id}/history`),
  getMyFreezeRequests: (status) => apiClient.get('/students/freeze-requests/my', { params: { status } }),
  updateFreezeFile: (requestId, fileUrl) => apiClient.patch(`/students/freeze-requests/${requestId}/file`, { file_url: fileUrl }),
  getPendingFreezeRequests: () => apiClient.get('/admin/freeze-requests/pending'),
  getAllFreezeRequests: (status) => apiClient.get('/students/freeze-requests/all', { params: { status } }),
  getFeeInfo: (studentId) => apiClient.get(`/students/${studentId}/fee-info`),
  getPendingInvoices: (studentId) => apiClient.get(`/students/${studentId}/pending-invoices`),
  sendReminderToAllDebtors: (minDebtDays = 7) => apiClient.post(`/admin/debtors/remind-all?min_debt_days=${minDebtDays}`),
  congratulate: (studentId) => apiClient.post(`/students/${studentId}/congratulate`),
};

export const groupsAPI = {
  getAll: () => apiClient.get('/groups/'),
  getById: (id) => apiClient.get(`/groups/${id}`),
  create: (data) => apiClient.post('/groups/', data),
  update: (id, data) => apiClient.put(`/groups/${id}`, data),
  delete: (id) => apiClient.delete(`/groups/${id}`),
  getStudents: (id) => apiClient.get(`/groups/${id}/students`),
};

export const eventsAPI = {
  getAll: (params) => apiClient.get('/events/', { params }),
  getById: (id) => apiClient.get(`/events/${id}`),
  create: (data) => apiClient.post('/events/', data),
  update: (id, data) => apiClient.put(`/events/${id}`, data),
  delete: (id) => apiClient.delete(`/events/${id}`),
};

export const attendanceAPI = {
  get: (params) => apiClient.get('/attendance/', { params }),
  getAll: (params) => apiClient.get('/attendance/', { params }),
  mark: (data) => apiClient.post('/attendance/', data),
  update: (id, data) => apiClient.put(`/attendance/${id}`, data),
  bulkMark: (data) => apiClient.post('/attendance/bulk', data),
  getStudentStats: (studentId) => apiClient.get(`/attendance/student/${studentId}/stats`),
  getMonthlyReport: (groupId, year, month) => apiClient.get('/attendance/monthly-report', { params: { group_id: groupId, year, month } }),
  getStudentMonthlyReport: (studentId, year, month) => apiClient.get(`/attendance/student/${studentId}/monthly-report`, { params: { year, month } }),
  getByEvent: (eventId) => apiClient.get(`/attendance/event/${eventId}`),
};

export const paymentsAPI = {
  getAll: (params) => apiClient.get('/payments/', { params }),
  getById: (id) => apiClient.get(`/payments/${id}`),
  create: (data) => apiClient.post('/payments/', data),
  update: (id, data) => apiClient.put(`/payments/${id}`, data),
  delete: (id) => apiClient.delete(`/payments/${id}`),
  getInvoices: (studentId) => apiClient.get(`/payments/student/${studentId}/invoices`),
  getByStudent: (studentId) => apiClient.get(`/payments/student/${studentId}`),
  getMatrix: (year, groupId) => apiClient.get('/payments/matrix', { params: { year, group_id: groupId } }),
  getPeriodsSummary: () => apiClient.get('/payments/summary/periods'),
  getStatus: (period) => apiClient.get('/payments/status', { params: { period } }),
  getMyDebts: () => apiClient.get('/payments/my-debts'),
  invoiceGroup: (groupId, period, customAmount, description, itemType) => apiClient.post(`/payments/invoice/group/${groupId}`, { payment_period: period, custom_amount: customAmount, description, item_type: itemType }),
  invoiceStudent: (studentId, period, amount, description) => apiClient.post(`/payments/invoice/student/${studentId}`, {
    payment_period: period,
    amount: amount,
    description: description
  }),
  createManualInvoice: (data) => apiClient.post('/payments/manual-invoice', data),
  getPendingManualInvoices: (studentId) => apiClient.get(`/payments/manual-invoice/${studentId}/pending`),
  getPaymentInfo: () => apiClient.get('/settings/public/payment-info'),
  uploadReceipt: (formData) => apiClient.post('/payments/receipt', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  confirmPayment: (id, method) => apiClient.put(`/payments/${id}`, { status: 'completed', method: method }),
};

export const messagesAPI = {
  get: (params) => apiClient.get('/messages/', { params }),
  getAnnouncements: (params) => apiClient.get('/posts/', { params }),
  send: (data) => apiClient.post('/messages/', data),
  markAsRead: (id) => apiClient.post(`/messages/${id}/read`),
  createAnnouncement: (data) => apiClient.post('/messages/announcements', data),
  
  // Missing methods added
  getGroups: () => apiClient.get('/groups/'),
  getGroupMessages: (groupId) => apiClient.get(`/messages/group/${groupId}`),
  markGroupChatRead: (groupId) => apiClient.post(`/messages/group/${groupId}/read`),
  getDirectMessages: (userId) => apiClient.get(`/messages/direct/${userId}`),
  sendDirectMessage: (userId, content) => apiClient.post(`/messages/direct/${userId}`, { content }),
  sendBulkSMS: (data) => apiClient.post('/messages/bulk-sms', data),
  sendGroupMessage: (groupId, content) => apiClient.post(`/messages/group/${groupId}`, { content }),
  sendSupport: (content) => apiClient.post('/messages/support', { content }),
  replyToSupport: (userId, content) => apiClient.post(`/messages/support/reply/${userId}`, { content }),
  getSupport: () => apiClient.get('/messages/support'),
  getSupportChats: () => apiClient.get('/messages/support/chats'),
  getSupportChatWith: (userId) => apiClient.get(`/messages/support/chat/${userId}`),
  getNotifications: () => apiClient.get('/messages/notifications'),
  getUnreadNotificationsCount: () => apiClient.get('/messages/notifications/unread'),
  getTotalUnreadCount: () => apiClient.get('/messages/notifications/unread-total'),
  markAllAsRead: () => apiClient.post('/messages/notifications/read-all'),
  getAbsenceRequests: (status) => apiClient.get('/parent/absence-requests/all', { params: { status } }),
  getFreezeRequests: () => apiClient.get('/parent/requests/freeze'),
  updateMessage: (id, content) => apiClient.put(`/messages/${id}`, { content }),
  deleteMessage: (id) => apiClient.delete(`/messages/${id}`),
};

export const leadsAPI = {
  // Use trailing slash for collection endpoints to avoid 307 redirect that can drop Authorization
  getAll: (params) => apiClient.get('/leads/', { params }),
  getById: (id) => apiClient.get(`/leads/${id}`),
  create: (data) => apiClient.post('/leads/', data),
  update: (id, data) => apiClient.put(`/leads/${id}`, data),
  delete: (id) => apiClient.delete(`/leads/${id}`),
  updateStatus: (id, status, reason) =>
    apiClient.put(`/leads/${id}/status`, null, {
      params: { status, ...(reason ? { reason } : {}) },
    }),
  getTasks: (leadId) => apiClient.get(`/leads/${leadId}/tasks`),
  createTask: (leadId, data) => apiClient.post(`/leads/${leadId}/tasks`, data),
  updateTask: (leadId, taskId, data) => apiClient.put(`/leads/${leadId}/tasks/${taskId}`, data),
  deleteTask: (leadId, taskId) => apiClient.delete(`/leads/${leadId}/tasks/${taskId}`),
};

export const hrCandidatesAPI = {
  getAll: (params) => apiClient.get('/hr/candidates/', { params }),
  getById: (id) => apiClient.get(`/hr/candidates/${id}`),
  create: (data) => apiClient.post('/hr/candidates/', data),
  update: (id, data) => apiClient.put(`/hr/candidates/${id}`, data),
  delete: (id) => apiClient.delete(`/hr/candidates/${id}`),
  updateStatus: (id, stage) =>
    apiClient.put(`/hr/candidates/${id}/stage`, null, {
      params: { stage },
    }),
};

export const funnelAPI = {
  getAll: () => apiClient.get('/funnel/'),
  create: (data) => apiClient.post('/funnel/', data),
  update: (id, data) => apiClient.put(`/funnel/${id}`, data),
  delete: (id) => apiClient.delete(`/funnel/${id}`),
  reorder: (orderedIds) => apiClient.post('/funnel/reorder', orderedIds),
  initDefaults: () => apiClient.post('/funnel/init-defaults'),
};

export const hrFunnelAPI = {
  getAll: () => apiClient.get('/hr/funnel/'),
  create: (data) => apiClient.post('/hr/funnel/', data),
  update: (id, data) => apiClient.put(`/hr/funnel/${id}`, data),
  delete: (id) => apiClient.delete(`/hr/funnel/${id}`),
  reorder: (orderedIds) => apiClient.post('/hr/funnel/reorder', orderedIds),
  initDefaults: () => apiClient.post('/hr/funnel/init-defaults'),
};

export const postsAPI = {
  getAll: (params) => apiClient.get('/posts', { params }),
  getById: (id) => apiClient.get(`/posts/${id}`),
  create: (data) => apiClient.post('/posts', data),
  update: (id, data) => apiClient.put(`/posts/${id}`, data),
  like: (id) => apiClient.post(`/posts/${id}/like`),
  pin: (id) => apiClient.put(`/posts/${id}/pin`),
  confirmRead: (id) => apiClient.post(`/posts/${id}/confirm`),
  delete: (id) => apiClient.delete(`/posts/${id}`),
};

export const coachAPI = {
  getDashboard: () => apiClient.get('/coach/dashboard'),
  getMyGroupsWithStudents: () => apiClient.get('/coach/my-groups-with-students'),
};

export const billingAPI = {
  generateInvoice: (studentId, month) => apiClient.post(`/billing/generate-invoice/${studentId}`, null, { params: { target_month: month } }),
  generateBulkInvoices: (data) => apiClient.post('/billing/generate-bulk-invoices', data),
  getStudentHistory: (studentId, params) => apiClient.get(`/billing/student-history/${studentId}`, { params }),
};

export const analyticsAPI = {
  get: (params) => apiClient.get('/analytics/', { params }),
  getTopPlayers: (groupId, month, year, limit) => apiClient.get('/analytics/top-players', { params: { group_id: groupId, month, year, limit } }),
  getFinancialReport: (periodType, monthsBack, startDate, endDate) => apiClient.get('/analytics/financial-overview', { params: { period_type: periodType, months_back: monthsBack, start_date: startDate, end_date: endDate } }),
  getRevenue: (period, startDate, endDate) => apiClient.get('/analytics/revenue', { params: { period, start_date: startDate, end_date: endDate } }),
  getAttendance: (period, monthsBack, startDate, endDate) => apiClient.get('/analytics/attendance', { params: { period, months_back: monthsBack, start_date: startDate, end_date: endDate } }),
  getCoachPerformance: (startDate, endDate) => apiClient.get('/analytics/coach-performance', { params: { start_date: startDate, end_date: endDate } }),
  getRevenueByServiceType: (startDate, endDate, status) => apiClient.get('/analytics/revenue-by-service-type', { params: { start_date: startDate, end_date: endDate, status } }),
  getServiceTypeAnalytics: (periodType, startDate, endDate, status) => apiClient.get('/analytics/service-type-analytics', { params: { period_type: periodType, start_date: startDate, end_date: endDate, status } }),
  getRevenueByMethod: (startDate, endDate, status, groupBy) => apiClient.get('/analytics/revenue-by-method', { params: { start_date: startDate, end_date: endDate, status, group_by: groupBy } }),
};

export const skillsAPI = {
  get: (studentId) => apiClient.get(`/skills/student/${studentId}`),
  getStudentSkills: (studentId) => apiClient.get(`/skills/student/${studentId}`),
  rateStudent: (data) => apiClient.post('/skills/', data),
  deleteRating: (id) => apiClient.delete(`/skills/${id}`),
  getSkillsHistory: (studentId) => apiClient.get(`/skills/student/${studentId}/history`),
  update: (studentId, data) => apiClient.post(`/skills/student/${studentId}`, data),
};

export const physicalTestsAPI = {
  getAll: () => apiClient.get('/physical-tests/'),
  create: (data) => apiClient.post('/physical-tests/', data),
  update: (id, data) => apiClient.put(`/physical-tests/${id}`, data),
  delete: (id) => apiClient.delete(`/physical-tests/${id}`),
  getStudentResults: (studentId) => apiClient.get(`/physical-tests/student/${studentId}`),
  addResult: (studentId, data) => apiClient.post(`/physical-tests/student/${studentId}`, data),
  deleteResult: (resultId) => apiClient.delete(`/physical-tests/result/${resultId}`),
  initDefaults: () => apiClient.post('/physical-tests/init-defaults'),
};

export const scheduleAPI = {
  getTemplates: (groupId = null, activeOnly = true) => {
    const params = {};
    if (groupId) params.group_id = groupId;
    if (activeOnly !== null) params.active_only = activeOnly;
    return apiClient.get('/schedule/templates', { params });
  },
  createTemplate: (data) => apiClient.post('/schedule/templates', data),
  updateTemplate: (id, data) => apiClient.put(`/schedule/templates/${id}`, data),
  deleteTemplate: (id) => apiClient.delete(`/schedule/templates/${id}`),
  applyTemplate: (id, data) => apiClient.post(`/schedule/templates/${id}/apply`, data),
  clearSchedule: (data) => apiClient.post('/schedule/templates/clear', data),
  clearAll: () => apiClient.post('/schedule/templates/clear-all'),
  getCalendar: (year, month, groupId) => apiClient.get('/schedule/calendar/month', { params: { year, month, group_id: groupId } }),
  getChanges: (groupId, limit) => apiClient.get('/schedule/changes', { params: { group_id: groupId, limit } }),
  getMyChanges: (limit) => apiClient.get('/schedule/changes/my', { params: { limit } }),
  generateEvents: (templateId) => apiClient.post(`/schedule/templates/${templateId}/generate`),
  cleanupFutureEvents: (templateId) => apiClient.post(`/schedule/templates/${templateId}/cleanup-future`),
  
  // Event management
  deleteEvent: (eventId, deleteFuture) => apiClient.delete(`/schedule/events/${eventId}`, { params: { delete_future: deleteFuture } }),
  
  updateEvent: async (eventId, data) => {
    const { changeType, reason, sendSms, updateFuture, ...rest } = data;
    
    // Use the comprehensive schedule update endpoint that handles logging and notifications
    return apiClient.post(`/schedule/events/${eventId}/update`, {
      action: changeType,
      reason,
      new_start_time: rest.newStartTime,
      new_end_time: rest.newEndTime,
      new_location: rest.newLocation,
      training_plan: rest.trainingPlan,
      send_sms: sendSms,
      update_future: updateFuture,
      notify_coach: true
    });
  },
};

export const settingsAPI = {
  getAll: (group) => apiClient.get('/settings/', { params: { group } }),
  update: (key, data) => apiClient.put(`/settings/${key}`, data),
  getPaymentInfo: () => apiClient.get('/settings/public/payment-info'),
};

export const salariesAPI = {
  getAll: () => apiClient.get('/salaries/'),
  getContracts: (params) => apiClient.get('/salaries/contracts', { params }),
  createContract: (data) => apiClient.post('/salaries/contracts', data),
  updateContract: (id, data) => apiClient.put(`/salaries/contracts/${id}`, data),
  getCalculation: (userId, year, month) => apiClient.get(`/salaries/calculate/${userId}`, { params: { year, month } }),
  getPayments: (params) => apiClient.get('/salaries/payments', { params }),
  createPayment: (data) => apiClient.post('/salaries/payments', data),
  updatePayment: (id, data) => apiClient.put(`/salaries/payments/${id}`, data),
  deletePayment: (id) => apiClient.delete(`/salaries/payments/${id}`),
  getMyPayments: () => apiClient.get('/salaries/my-payments'),
  getReport: (year, month) => apiClient.get('/salaries/report', { params: { year, month } }),
  getStaff: () => apiClient.get('/salaries/staff'),
};

export const expensesAPI = {
  getAll: (params) => apiClient.get('/expenses/', { params }),
  getCategories: () => apiClient.get('/expenses/categories'),
  create: (data) => apiClient.post('/expenses/', data),
  update: (id, data) => apiClient.put(`/expenses/${id}`, data),
  delete: (id) => apiClient.delete(`/expenses/${id}`),
};

export const parentAPI = {
  getChildren: () => apiClient.get('/parent/children'),
  getAbsenceRequests: (studentId) => apiClient.get(`/parent/students/${studentId}/absence-requests`),
  createAbsenceRequest: (studentId, date, reason) => apiClient.post(`/parent/students/${studentId}/absence-request`, null, { params: { absence_date: date, reason } }),
  getAllAbsenceRequests: (status) => apiClient.get('/parent/absence-requests/all', { params: { status } }),
  approveAbsenceRequest: (id) => apiClient.put(`/parent/absence-requests/${id}/approve`),
  rejectAbsenceRequest: (id) => apiClient.put(`/parent/absence-requests/${id}/reject`),
};

export const pushAPI = {
  getVapidPublicKey: () => apiClient.get('/push/vapid-public-key'),
  subscribe: (subscription, userAgent) => apiClient.post('/push/subscribe', {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.getKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))) : subscription.keys.p256dh,
      auth: subscription.getKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')))) : subscription.keys.auth
    },
    user_agent: userAgent
  }),
  unsubscribe: (endpoint) => apiClient.post('/push/unsubscribe', { endpoint }),
  sendTestNotification: () => apiClient.post('/push/test-notification'),
};

// Moved to top
// export const fileUploadAPI = { ... }

export const historyAPI = {
  getHistory: async (params) => {
    const response = await apiClient.get('/history/', { params });
    return response.data;
  },
  getCalendar: async (year, month) => {
    const response = await apiClient.get(`/history/calendar/${year}/${month}`);
    return response.data;
  },
  getByDate: async (date) => {
    const response = await apiClient.get(`/history/date/${date}`);
    return response.data;
  },
  restoreVersion: async (auditId) => {
    const response = await apiClient.post(`/history/${auditId}/restore`);
    return response.data;
  },
  getTrash: async (params) => {
    const response = await apiClient.get('/trash/', { params });
    return response.data;
  },
  restoreFromTrash: async (entityType, entityId) => {
    const response = await apiClient.post(`/trash/${entityType}/${entityId}/restore`);
    return response.data;
  },
  deleteForever: async (entityType, entityId) => {
    const response = await apiClient.delete(`/trash/${entityType}/${entityId}`);
    return response.data;
  },
  // Legacy alias to maintain backward compatibility in older calls
  restore: async (entityType, entityId) => {
    const response = await apiClient.post(`/trash/${entityType}/${entityId}/restore`);
    return response.data;
  }
};

export const statsAPI = {
  getDashboardStats: async () => {
    const response = await apiClient.get('/stats/dashboard');
    return response.data;
  },
  getPaymentStats: async (period) => {
    const response = await apiClient.get('/stats/dashboard');
    return response.data;
  },
  getAttendanceStats: async (period) => {
      const response = await apiClient.get('/stats/dashboard');
      return response.data;
  }
};

export const adminAPI = {
  getPendingFreezeRequests: async () => {
    const response = await apiClient.get('/admin/freeze-requests/pending');
    return response.data;
  },
  approveFreezeRequest: async (id) => {
    // Check studentsAPI for correct endpoint if needed, but likely /students/...
    const response = await apiClient.post(`/students/approve-freeze/${id}`);
    return response.data;
  },
  rejectFreezeRequest: async (id, reason) => {
    const response = await apiClient.post(`/students/reject-freeze/${id}`, { reason });
    return response.data;
  },
  getDebtors: async () => {
     const response = await apiClient.get('/admin/debtors');
     return response.data;
  },
  remindAllDebtors: async (minDebtDays) => {
      const response = await apiClient.post(`/admin/debtors/remind-all?min_debt_days=${minDebtDays}`);
      return response.data;
  },
  bulkChangeGroup: async (studentIds, newGroupId) => {
      const response = await apiClient.post('/admin/bulk/change-group', { student_ids: studentIds, new_group_id: newGroupId });
      return response.data;
  },
  getSystemStats: async () => {
    const response = await apiClient.get('/admin/system/stats');
    return response.data;
  },
  getActivityStats: async (days = 30) => {
    const response = await apiClient.get(`/admin/system/activity-stats?days=${days}`);
    return response.data;
  },
  cleanupSystem: async (action, types = []) => {
    let url = `/admin/system/cleanup?action=${action}`;
    if (types && types.length > 0) {
        url += `&types=${types.join(',')}`;
    }
    const response = await apiClient.post(url);
    return response.data;
  }
};

export const marketingAPI = {
  getCampaigns: () => apiClient.get('/marketing/campaigns/'),
  createCampaign: (data) => apiClient.post('/marketing/campaigns/', data),
  updateCampaign: (id, data) => apiClient.put(`/marketing/campaigns/${id}`, data),
  deleteCampaign: (id) => apiClient.delete(`/marketing/campaigns/${id}`),
};

export const birthdaysAPI = {
  getToday: () => apiClient.get('/birthdays/today'),
  send: (studentId) => apiClient.post(`/birthdays/${studentId}/send`),
  getTemplates: () => apiClient.get('/birthdays/templates'),
  updateTemplates: (data) => apiClient.post('/birthdays/templates', data),
};

export const tasksAPI = {
  getAll: () => apiClient.get('/tasks/'),
  create: (data) => apiClient.post('/tasks', data),
  update: (id, data) => apiClient.put(`/tasks/${id}`, data),
  delete: (id) => apiClient.delete(`/tasks/${id}`),
  getAnalytics: (days = 30) => apiClient.get(`/tasks/analytics?days=${days}`),
};

const api = {
    auth: authAPI,
    users: usersAPI,
    students: studentsAPI,
    groups: groupsAPI,
    events: eventsAPI,
    attendance: attendanceAPI,
    payments: paymentsAPI,
    messages: messagesAPI,
    posts: postsAPI,
    coach: coachAPI,
    analytics: analyticsAPI,
    skills: skillsAPI,
    physicalTests: physicalTestsAPI,
    schedule: scheduleAPI,
    settings: settingsAPI,
    salaries: salariesAPI,
    expenses: expensesAPI,
    parent: parentAPI,
    push: pushAPI,
    fileUpload: uploadAPI,
    history: historyAPI,
    stats: statsAPI,
    admin: adminAPI,
    marketing: marketingAPI,
    birthdays: birthdaysAPI,
    client: apiClient 
};

export default api;

// Force re-bundle
