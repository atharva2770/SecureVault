import { Navigate } from 'react-router-dom'

/** Folder checkboxes now live on People & folders. */
export default function UserRightsPage(): React.JSX.Element {
  return <Navigate to="/admin/users" replace />
}
