/**
 * Skeleton loading components
 * Show placeholder UI while content is loading
 */
import React from 'react';

// Base skeleton component with animation
export function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      {...props}
    />
  );
}

// Text line skeleton
export function SkeletonText({ lines = 1, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 && lines > 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

// Avatar skeleton
export function SkeletonAvatar({ size = 'md' }) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  };
  
  return <Skeleton className={`${sizes[size]} rounded-full`} />;
}

// Card skeleton
export function SkeletonCard({ hasImage = false, hasAvatar = false }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      {hasImage && <Skeleton className="h-48 w-full" />}
      
      <div className="flex items-center space-x-3">
        {hasAvatar && <SkeletonAvatar />}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      
      <SkeletonText lines={3} />
    </div>
  );
}

// Table row skeleton
export function SkeletonTableRow({ columns = 4 }) {
  return (
    <tr className="border-b">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-4 px-4">
          <Skeleton className="h-4" />
        </td>
      ))}
    </tr>
  );
}

// Table skeleton
export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="py-3 px-4">
                <Skeleton className="h-4" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Dashboard stat card skeleton
export function SkeletonStatCard() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    </div>
  );
}

// Dashboard skeleton
export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      
      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-64" />
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-64" />
        </div>
      </div>
      
      {/* Table */}
      <SkeletonTable rows={5} columns={5} />
    </div>
  );
}

// Student card skeleton
export function SkeletonStudentCard() {
  return (
    <div className="bg-white rounded-lg shadow p-4 flex items-center space-x-4">
      <SkeletonAvatar size="lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-24" />
        <div className="flex space-x-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// Student list skeleton
export function SkeletonStudentList({ count = 5 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStudentCard key={i} />
      ))}
    </div>
  );
}

// Form skeleton
export function SkeletonForm({ fields = 4 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

// Payment card skeleton
export function SkeletonPaymentCard() {
  return (
    <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-200">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="mt-3 flex space-x-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}

// Post/News skeleton
export function SkeletonPost() {
  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center space-x-3">
        <SkeletonAvatar size="sm" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-5 w-3/4" />
      <SkeletonText lines={3} />
      <Skeleton className="h-40 w-full rounded" />
      <div className="flex space-x-4 pt-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}

// Loading wrapper component
export function LoadingWrapper({ isLoading, skeleton, children }) {
  if (isLoading) {
    return skeleton;
  }
  return children;
}

export default {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTable,
  SkeletonTableRow,
  SkeletonStatCard,
  SkeletonDashboard,
  SkeletonStudentCard,
  SkeletonStudentList,
  SkeletonForm,
  SkeletonPaymentCard,
  SkeletonPost,
  LoadingWrapper,
};
