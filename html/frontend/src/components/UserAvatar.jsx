import React, { useState } from 'react';

const UserAvatar = ({ 
  user, 
  size = 'w-10 h-10', 
  className = '', 
  onClick,
  showStatus = false,
  children
}) => {
  const [error, setError] = useState(false);
  let imgSrc = null;
  const hasAvatar = !!user?.avatar_url;
  if (hasAvatar) {
    if (user.avatar_url.startsWith('http')) {
      imgSrc = user.avatar_url;
    } else {
      const baseUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || '';
      imgSrc = `${baseUrl}${user.avatar_url}${user.avatar_url.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
    }
  }

  const getInitials = () => {
    if (!user) return '?';
    const first = user.first_name?.[0] || '';
    const last = user.last_name?.[0] || '';
    return (first + last).toUpperCase() || '?';
  };

  const getStatusColor = () => {
    if (!user?.status) return null;
    switch (user.status) {
      case 'active': return 'bg-green-500';
      case 'inactive': return 'bg-gray-500';
      case 'frozen': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div 
      className={`relative ${size} rounded-full flex-shrink-0 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-gray-700 text-white font-bold border border-white/10 shadow-sm`}>
        {imgSrc && !error ? (
          <img 
            src={imgSrc} 
            alt={`${user?.first_name || ''} ${user?.last_name || ''}`}
            className="w-full h-full object-cover"
            onError={() => setError(true)}
          />
        ) : (
          <span className="text-[length:var(--avatar-text-size,50%)]">
            {getInitials()}
          </span>
        )}
      </div>
      
      {showStatus && user?.status && (
        <div className={`absolute bottom-0 right-0 w-[25%] h-[25%] rounded-full border-2 border-[#13151A] ${getStatusColor()}`} />
      )}
      {children}
    </div>
  );
};

export default UserAvatar;
