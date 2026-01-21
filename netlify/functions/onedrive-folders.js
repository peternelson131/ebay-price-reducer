/**
 * OneDrive Folders - List folder structure
 * 
 * GET /onedrive-folders?path=/path/to/folder
 * Returns folder tree from user's OneDrive
 * 
 * Query params:
 * - path: (optional) Specific folder path to list (defaults to root)
 * - folderId: (optional) Specific folder ID to list
 * 
 * Returns folders only (not files) for folder picker UI
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { graphApiRequest } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Build folder tree structure from Graph API response
 */
function buildFolderTree(items, parentPath = '') {
  return items
    .filter(item => item.folder) // Only folders, not files
    .map(folder => {
      // Construct the full path
      let fullPath;
      if (parentPath) {
        // If we have a parent path, append the folder name
        fullPath = parentPath === 'My Files' 
          ? folder.name  // Root level: just the folder name
          : `${parentPath}/${folder.name}`;
      } else {
        // No parent path provided, use just the name
        fullPath = folder.name;
      }

      return {
        id: folder.id,
        name: folder.name,
        path: fullPath,
        childCount: folder.folder.childCount,
        webUrl: folder.webUrl,
        lastModified: folder.lastModifiedDateTime
      };
    });
}

/**
 * Extract user-friendly path from OneDrive's parentReference.path
 * OneDrive paths look like: "/drive/root:/Documents/Folder"
 * We want to show: "My Files/Documents/Folder"
 */
function extractUserFriendlyPath(parentReferencePath, folderName) {
  if (!parentReferencePath) {
    return 'My Files';
  }

  // Remove the "/drive/root:" prefix
  let cleanPath = parentReferencePath.replace(/^\/drive\/root:?/, '');
  
  // Remove leading slash
  cleanPath = cleanPath.replace(/^\//, '');
  
  // If empty, we're at root
  if (!cleanPath) {
    return 'My Files';
  }
  
  // Otherwise prepend "My Files"
  return `My Files/${cleanPath}`;
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Verify user authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return {
        statusCode: authResult.statusCode,
        headers,
        body: JSON.stringify({ error: authResult.error })
      };
    }

    const userId = authResult.userId;
    const params = event.queryStringParameters || {};
    const { folderId, path } = params;

    // Determine which endpoint to use
    let endpoint;
    let currentPath = '';

    if (folderId) {
      // List specific folder by ID
      endpoint = `/me/drive/items/${folderId}/children`;
      
      // If path not provided, fetch the folder metadata to get its path
      if (!path) {
        const folderMetadata = await graphApiRequest(userId, `/me/drive/items/${folderId}`);
        currentPath = extractUserFriendlyPath(
          folderMetadata.parentReference?.path,
          folderMetadata.name
        );
        // Append the current folder name to create the full path for children
        if (currentPath === 'My Files') {
          currentPath = folderMetadata.name;
        } else {
          currentPath = `${currentPath}/${folderMetadata.name}`;
        }
      } else {
        currentPath = path;
      }
    } else if (path) {
      // List folder by path
      const encodedPath = encodeURIComponent(path);
      endpoint = `/me/drive/root:/${encodedPath}:/children`;
      currentPath = path;
    } else {
      // List root folder
      endpoint = '/me/drive/root/children';
      currentPath = 'My Files';
    }

    // Make Graph API request with automatic token refresh
    const response = await graphApiRequest(userId, endpoint);

    const folders = buildFolderTree(response.value || [], currentPath);

    // Sort by name
    folders.sort((a, b) => a.name.localeCompare(b.name));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        folders,
        currentPath,
        totalCount: folders.length,
        hasMore: !!response['@odata.nextLink'] // Pagination support
      })
    };

  } catch (error) {
    console.error('OneDrive folders error:', error);
    
    // Provide helpful error messages
    let userMessage = 'Failed to load folders';
    if (error.message.includes('not connected')) {
      userMessage = 'OneDrive not connected. Please connect your account first.';
    } else if (error.message.includes('401')) {
      userMessage = 'OneDrive authorization expired. Please reconnect your account.';
    } else if (error.message.includes('404')) {
      userMessage = 'Folder not found';
    }

    return {
      statusCode: error.message.includes('not connected') ? 400 : 500,
      headers,
      body: JSON.stringify({ 
        error: userMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};
