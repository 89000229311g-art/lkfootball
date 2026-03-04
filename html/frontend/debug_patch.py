file_path = 'src/pages/UsersManagement.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "const handleDelete = (user) => {"
end_marker = "setShowDeleteModal(true);\n  };"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx != -1 and end_idx != -1:
    print("Found markers!")
    extracted = content[start_idx:end_idx + len(end_marker)]
    print(repr(extracted))
else:
    print("Markers not found")
    if start_idx == -1: print("Start marker not found")
    if end_idx == -1: print("End marker not found")
