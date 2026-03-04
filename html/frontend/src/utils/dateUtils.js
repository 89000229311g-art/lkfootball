/**
 * Generates a list of academy years.
 * Returns years from student's admission year (or current year - 5) to current year + 15.
 * This ensures statistics can be displayed for the entire duration a student is in the academy.
 * 
 * @param {number|string} [admissionYear] - Optional admission year/date of the student
 * @returns {number[]} Array of years
 */
export const getAcademyYears = (admissionYear) => {
  const currentYear = new Date().getFullYear();
  let startYear = currentYear - 5; // Default: show 5 years back from current year

  if (admissionYear) {
      const year = new Date(admissionYear).getFullYear();
      // Use admission year if valid, otherwise default to 5 years back
      if (!isNaN(year)) {
          startYear = year;
      }
  }
  
  const endYear = currentYear + 15;
  
  const years = [];
  // Ensure we cover from startYear to endYear
  // If startYear > endYear (future student), we at least show that range
  for (let year = startYear; year <= endYear; year++) {
    years.push(year);
  }
  
  return years;
};
