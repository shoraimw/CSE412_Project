export interface DriveUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: 'Passenger' | 'Driver' | 'Vehicle Owner';
  passwordHash: string;
}
export const users: DriveUser[] = [];
export const vehicles = [
  { id: 1, name: 'Toyota Axio', type: 'Car', location: 'Dhaka', price: 3000, seats: 5, image: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=600' },
  { id: 2, name: 'Honda Civic', type: 'Car', location: 'Chattogram', price: 4000, seats: 5, image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600' },
  { id: 3, name: 'Yamaha FZ', type: 'Bike', location: 'Dhaka', price: 1000, seats: 2, image: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600' }
];
export const bookings: Array<{
  id: number; userId: number; vehicleId: number; vehicleName: string;
  customerName: string; startDate: string; endDate: string; status: 'Pending';
}> = [];