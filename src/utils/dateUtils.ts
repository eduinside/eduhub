
export const formatDate = (dateInput: string | Date | number | any): string => {
    if (!dateInput) return '-';

    let date: Date;
    if (dateInput instanceof Date) {
        date = dateInput;
    } else if (typeof dateInput === 'string') {
        // 'YYYY-MM-DD' or ISO string
        date = new Date(dateInput);
    } else if (typeof dateInput === 'number') {
        date = new Date(dateInput);
    } else if (dateInput?.seconds) {
        // Firestore Timestamp
        date = new Date(dateInput.seconds * 1000);
    } else if (dateInput?.toDate) {
        // Firestore Timestamp method
        date = dateInput.toDate();
    } else {
        return '-';
    }

    // Check for invalid date
    if (isNaN(date.getTime())) return '-';

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = days[date.getDay()];

    return `${year}. ${month}. ${day}.(${weekday})`;
};
