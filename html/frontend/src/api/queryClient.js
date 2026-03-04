/**
 * React Query configuration and API hooks
 * Provides caching, background refetching, and offline support
 */
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient as api } from './client';

// Query Client configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Keep previous data while fetching
      keepPreviousData: true,
    },
    mutations: {
      retry: 2,
    },
  },
});

// Query Keys - centralized for consistency
export const queryKeys = {
  // Students
  students: ['students'],
  student: (id) => ['students', id],
  studentSkills: (id) => ['students', id, 'skills'],
  studentPayments: (id) => ['students', id, 'payments'],
  studentAttendance: (id) => ['students', id, 'attendance'],
  
  // Groups
  groups: ['groups'],
  group: (id) => ['groups', id],
  groupStudents: (id) => ['groups', id, 'students'],
  
  // Payments
  payments: ['payments'],
  payment: (id) => ['payments', id],
  debtors: ['debtors'],
  
  // Analytics
  dashboard: ['analytics', 'dashboard'],
  revenue: ['analytics', 'revenue'],
  attendance: ['analytics', 'attendance'],
  
  // Posts/News
  posts: ['posts'],
  post: (id) => ['posts', id],
  
  // User
  currentUser: ['user', 'current'],
  myChildren: ['user', 'children'],
};

// ==================== STUDENT HOOKS ====================

export function useStudents(filters = {}) {
  return useQuery({
    queryKey: [...queryKeys.students, filters],
    queryFn: () => api.get('/students', { params: filters }).then(res => res.data),
  });
}

export function useStudent(id) {
  return useQuery({
    queryKey: queryKeys.student(id),
    queryFn: () => api.get(`/students/${id}`).then(res => res.data),
    enabled: !!id,
  });
}

export function useStudentSkills(id) {
  return useQuery({
    queryKey: queryKeys.studentSkills(id),
    queryFn: () => api.get(`/skills/student/${id}`).then(res => res.data),
    enabled: !!id,
  });
}

export function useUpdateStudent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/students/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries(queryKeys.student(id));
      queryClient.invalidateQueries(queryKeys.students);
    },
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data) => api.post('/students', data),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.students);
    },
  });
}

// ==================== GROUP HOOKS ====================

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => api.get('/groups').then(res => res.data),
    staleTime: 10 * 60 * 1000, // Groups don't change often
  });
}

export function useGroup(id) {
  return useQuery({
    queryKey: queryKeys.group(id),
    queryFn: () => api.get(`/groups/${id}`).then(res => res.data),
    enabled: !!id,
  });
}

// ==================== PAYMENT HOOKS ====================

export function usePayments(filters = {}) {
  return useQuery({
    queryKey: [...queryKeys.payments, filters],
    queryFn: () => api.get('/payments', { params: filters }).then(res => res.data),
  });
}

export function useDebtors() {
  return useQuery({
    queryKey: queryKeys.debtors,
    queryFn: () => api.get('/admin/debtors').then(res => res.data),
    staleTime: 2 * 60 * 1000, // 2 minutes for financial data
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data) => api.post('/payments', data),
    onSuccess: (_, { student_id }) => {
      queryClient.invalidateQueries(queryKeys.payments);
      queryClient.invalidateQueries(queryKeys.debtors);
      if (student_id) {
        queryClient.invalidateQueries(queryKeys.studentPayments(student_id));
      }
    },
  });
}

// ==================== ANALYTICS HOOKS ====================

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.get('/admin/quick/dashboard-stats').then(res => res.data),
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useRevenueAnalytics(period = 'month') {
  return useQuery({
    queryKey: [...queryKeys.revenue, period],
    queryFn: () => api.get('/analytics/revenue', { params: { period } }).then(res => res.data),
  });
}

// ==================== POSTS HOOKS ====================

export function usePosts(filters = {}) {
  return useQuery({
    queryKey: [...queryKeys.posts, filters],
    queryFn: () => api.get('/posts', { params: filters }).then(res => res.data),
  });
}

export function useMyChildrenPosts() {
  return useQuery({
    queryKey: queryKeys.myChildren,
    queryFn: () => api.get('/posts/my-children').then(res => res.data),
  });
}

// ==================== ATTENDANCE HOOKS ====================

export function useMarkAttendance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data) => api.post('/attendance', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['attendance']);
    },
    // Optimistic update
    onMutate: async (newAttendance) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(['attendance']);
      
      // Snapshot previous value
      const previousAttendance = queryClient.getQueryData(['attendance']);
      
      // Optimistically update
      queryClient.setQueryData(['attendance'], old => ({
        ...old,
        records: [...(old?.records || []), newAttendance]
      }));
      
      return { previousAttendance };
    },
    onError: (err, newAttendance, context) => {
      // Rollback on error
      queryClient.setQueryData(['attendance'], context.previousAttendance);
    },
  });
}

// ==================== OFFLINE SYNC ====================

// Save data for offline sync
export async function saveForOfflineSync(type, data) {
  const db = await openOfflineDB();
  const tx = db.transaction(`pending-${type}`, 'readwrite');
  const store = tx.objectStore(`pending-${type}`);
  await store.add({ ...data, timestamp: Date.now() });
}

// Check for pending offline data
export async function getPendingOfflineData(type) {
  const db = await openOfflineDB();
  const tx = db.transaction(`pending-${type}`, 'readonly');
  const store = tx.objectStore(`pending-${type}`);
  return store.getAll();
}

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SunnyAcademyOffline', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      ['attendance', 'payments'].forEach(type => {
        if (!db.objectStoreNames.contains(`pending-${type}`)) {
          db.createObjectStore(`pending-${type}`, { keyPath: 'id', autoIncrement: true });
        }
      });
    };
  });
}

export { QueryClientProvider };
