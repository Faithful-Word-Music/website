/**
 * Labels for the signed-in navigation. The public navigation (Home, Song
 * List, Library, Contact) is in src/config/site.ts; which links show for
 * whom is decided in src/lib/navigation.ts.
 */
export const navigationContent = {
  dashboard: "Dashboard",
  profile: "Profile",
  accountSettings: "Account settings",
  admin: "Admin",

  /**
   * The site's own back links ("← Back to …") name the page they lead to:
   * the page the visitor actually came from (src/lib/page-origin.ts).
   * {year} is replaced. A page not listed here is simply "Back".
   */
  back: {
    dashboard: "Back to Dashboard",
    home: "Back to Home",
    songList: "Back to the song list",
    archive: "Back to the archive",
    years: "Back to the year in song",
    year: "Back to {year} in song",
    library: "Back to the Library",
    song: "Back to the song",
    contact: "Back to Contact",
    profile: "Back to your profile",
    account: "Back to Account settings",
    admin: "Back to Admin",
    requests: "Back to requests",
    invitations: "Back to invitations",
    people: "Back to people",
    roles: "Back to roles",
    profileOptions: "Back to titles & instruments",
    generic: "Back",
  },
} as const;
