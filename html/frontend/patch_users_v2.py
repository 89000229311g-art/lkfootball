import os

file_path = 'src/pages/UsersManagement.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Define replacement for handleDelete
new_handle_delete = """const handleDelete = (user) => {
    try {
      console.log('Delete requested for user:', user);
      if (!user || !user.id) {
        console.error('Invalid user object for delete');
        alert('Ошибка: Некорректный объект пользователя');
        return;
      }

      const userRole = user.role?.toLowerCase();
      const userName = user.full_name ? String(user.full_name) : 'User';
      const safeName = transliterate(userName, language);
      
      let confirmMessage = `${t('delete_user_confirm_title') || 'Вы уверены, что хотите удалить пользователя'} ${safeName}?`;
      
      // Для родителей - предупреждение о связанном удалении
      if (userRole === 'parent') {
        const linkedStudents = students.filter(s => s.guardian_ids?.includes(user.id));
        if (linkedStudents.length > 0) {
          const studentNames = linkedStudents.map(s => {
            const sName = s.first_name ? String(s.first_name) : '';
            const sLast = s.last_name ? String(s.last_name) : '';
            return getLocalizedName(sName, sLast, language);
          }).join(', ');
          confirmMessage += `\n\n⚠️ ${t('delete_parent_warning') || 'Внимание!'}\n`;
          confirmMessage += `${t('delete_parent_students') || 'Связанные ученики'}: ${studentNames}\n`;
          confirmMessage += `${t('delete_parent_archive_warning') || 'Ученики будут перемещены в архив.'}`;
        }
      }
      
      // Для тренеров - предупреждение о группах
      if (userRole === 'coach') {
        const assignedGroups = groups.filter(g => g.coach_id === user.id);
        if (assignedGroups.length > 0) {
          const groupNames = assignedGroups.map(g => transliterate(g.name || '', language)).join(', ');
          confirmMessage += `\n\n⚠️ ${t('delete_coach_warning') || 'Внимание!'}: ${groupNames}\n`;
          confirmMessage += `${t('delete_coach_groups_warning') || 'Группы останутся без тренера.'}`;
        }
      }
      
      setItemToDelete({ type: 'user', data: user });
      setDeleteConfirmationText(confirmMessage);
      setShowDeleteModal(true);
    } catch (err) {
      console.error('CRITICAL ERROR in handleDelete:', err);
      setItemToDelete({ type: 'user', data: user });
      setDeleteConfirmationText(`${t('delete_user_confirm_title') || 'Удалить пользователя'}?`);
      setShowDeleteModal(true);
    }
  };"""

# Locate handleDelete
start_marker = "const handleDelete = (user) => {"
end_marker = "setShowDeleteModal(true);\n  };"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx != -1 and end_idx != -1:
    end_pos = end_idx + len(end_marker)
    # Replace
    content = content[:start_idx] + new_handle_delete + content[end_pos:]
    print("Replaced handleDelete")
else:
    print("Could not find handleDelete range")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
