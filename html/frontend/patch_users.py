import os

file_path = 'src/pages/UsersManagement.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_handle_delete = """  const handleDelete = (user) => {
    console.log('Delete requested for user:', user);
    if (!user || !user.id) {
      console.error('Invalid user object for delete');
      return;
    }

    const userRole = user.role?.toLowerCase();
    let confirmMessage = `${t('delete_user_confirm_title') || 'Вы уверены, что хотите удалить пользователя'} ${transliterate(user.full_name || 'User', language)}?`;
    
    // Для родителей - предупреждение о связанном удалении
    if (userRole === 'parent') {
      const linkedStudents = students.filter(s => s.guardian_ids?.includes(user.id));
      if (linkedStudents.length > 0) {
        const studentNames = linkedStudents.map(s => getLocalizedName(s.first_name, s.last_name, language)).join(', ');
        confirmMessage += `\n\n⚠️ ${t('delete_parent_warning') || 'Внимание!'}\n`;
        confirmMessage += `${t('delete_parent_students') || 'Связанные ученики'}: ${studentNames}\n`;
        confirmMessage += `${t('delete_parent_archive_warning') || 'Ученики будут перемещены в архив.'}`;
      }
    }
    
    // Для тренеров - предупреждение о группах
    if (userRole === 'coach') {
      const assignedGroups = groups.filter(g => g.coach_id === user.id);
      if (assignedGroups.length > 0) {
        const groupNames = assignedGroups.map(g => transliterate(g.name, language)).join(', ');
        confirmMessage += `\n\n⚠️ ${t('delete_coach_warning') || 'Внимание!'}: ${groupNames}\n`;
        confirmMessage += `${t('delete_coach_groups_warning') || 'Группы останутся без тренера.'}`;
      }
    }
    
    setItemToDelete({ type: 'user', data: user });
    setDeleteConfirmationText(confirmMessage);
    setShowDeleteModal(true);
  };"""

new_handle_delete = """  const handleDelete = (user) => {
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
          confirmMessage += `\\n\\n⚠️ ${t('delete_parent_warning') || 'Внимание!'}\\n`;
          confirmMessage += `${t('delete_parent_students') || 'Связанные ученики'}: ${studentNames}\\n`;
          confirmMessage += `${t('delete_parent_archive_warning') || 'Ученики будут перемещены в архив.'}`;
        }
      }
      
      // Для тренеров - предупреждение о группах
      if (userRole === 'coach') {
        const assignedGroups = groups.filter(g => g.coach_id === user.id);
        if (assignedGroups.length > 0) {
          const groupNames = assignedGroups.map(g => transliterate(g.name || '', language)).join(', ');
          confirmMessage += `\\n\\n⚠️ ${t('delete_coach_warning') || 'Внимание!'}: ${groupNames}\\n`;
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

old_handle_delete_student = """  const handleDeleteStudent = (student) => {
    console.log('Delete requested for student:', student);
    if (!student || !student.id) {
       console.error('Invalid student object for delete');
       return;
    }
    
    const confirmMessage = t('delete_student_confirm_text') || `Удалить ученика ${student.first_name} ${student.last_name}?`;
    
    setItemToDelete({ type: 'student', data: student });
    setDeleteConfirmationText(confirmMessage);
    setShowDeleteModal(true);
  };"""

new_handle_delete_student = """  const handleDeleteStudent = (student) => {
    try {
      console.log('Delete requested for student:', student);
      if (!student || !student.id) {
         console.error('Invalid student object for delete');
         alert('Ошибка: Некорректный объект ученика');
         return;
      }
      
      const sName = student.first_name ? String(student.first_name) : '';
      const sLast = student.last_name ? String(student.last_name) : '';
      
      const confirmMessage = t('delete_student_confirm_text') || `Удалить ученика ${sName} ${sLast}?`;
      
      setItemToDelete({ type: 'student', data: student });
      setDeleteConfirmationText(confirmMessage);
      setShowDeleteModal(true);
    } catch (err) {
      console.error('CRITICAL ERROR in handleDeleteStudent:', err);
      setItemToDelete({ type: 'student', data: student });
      setDeleteConfirmationText('Удалить ученика?');
      setShowDeleteModal(true);
    }
  };"""

# Normalize line endings
content = content.replace('\r\n', '\n')
old_handle_delete = old_handle_delete.replace('\r\n', '\n')
new_handle_delete = new_handle_delete.replace('\r\n', '\n')
old_handle_delete_student = old_handle_delete_student.replace('\r\n', '\n')
new_handle_delete_student = new_handle_delete_student.replace('\r\n', '\n')

# Replace
if old_handle_delete in content:
    content = content.replace(old_handle_delete, new_handle_delete)
    print("Replaced handleDelete")
else:
    print("Could not find handleDelete")

if old_handle_delete_student in content:
    content = content.replace(old_handle_delete_student, new_handle_delete_student)
    print("Replaced handleDeleteStudent")
else:
    print("Could not find handleDeleteStudent")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
